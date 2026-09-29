-- One PostgreSQL statement/transaction: no orphan customer/vehicle on job failure.
begin;
create or replace function public.save_maintenance_with_links(
 p_store_id uuid,p_job jsonb,p_customer jsonb default null,p_vehicle jsonb default null,p_job_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare
 v_job public.maintenance_jobs%rowtype;
 v_values public.maintenance_jobs%rowtype;
 v_customer_id uuid;
 v_vehicle_id uuid;
 v_job_id uuid;
 v_line jsonb;
 v_birth_date date;
begin
 if not public.current_user_can_write_store(p_store_id) then
  raise exception '整備案件を保存する権限がありません。' using errcode='42501';
 end if;
 if p_job is null or jsonb_typeof(p_job)<>'object' then raise exception '案件データが不正です' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_job) k where not(k=any(array['job_no','job_type','status','priority','reception_date','reception_route','assigned_user_name','request_detail','symptoms','work_items','planned_parts','work_instruction','scheduled_in_at','scheduled_start_date','scheduled_finish_date','scheduled_delivery_at','actual_in_date','actual_finish_date','actual_delivery_date','loaner_status','labor_amount','parts_amount','inspection_amount','legal_fee_amount','additional_amount','discount_amount','estimated_total_amount','billing_amount','payment_method','estimate_confirm_status','line_notification_enabled','remind_before_enabled','remind_before_days','estimate_notice_enabled','completion_notice_enabled','next_inspection_notice_enabled','next_inspection_date','line_notice_memo','work_memo','caution_note','customer_message','work_details','work_details_version','tax_display_mode','discount_input_amount','customer_id','vehicle_id']))) then
  raise exception '変更できない案件項目が含まれています' using errcode='22023';
 end if;
 if p_job_id is not null then
  select * into v_job from public.maintenance_jobs where id=p_job_id and store_id=p_store_id and deleted_at is null for update;
  if not found then raise exception '整備案件が見つかりません' using errcode='42501'; end if;
 end if;
 if p_job ? 'work_details' then
  if jsonb_typeof(p_job->'work_details') is distinct from 'array' then raise exception '作業明細は配列が必要です' using errcode='22023'; end if;
  for v_line in select value from jsonb_array_elements(p_job->'work_details') loop
   if jsonb_typeof(v_line)<>'object' or nullif(btrim(v_line->>'description'),'') is null
      or jsonb_typeof(v_line->'quantity') is distinct from 'number'
      or jsonb_typeof(v_line->'unit_price') is distinct from 'number'
      or jsonb_typeof(v_line->'amount') is distinct from 'number'
      or jsonb_typeof(v_line->'tax_rate') is distinct from 'number' then
    raise exception '作業明細の形式が不正です' using errcode='22023';
   end if;
   if (v_line->>'quantity')::numeric<=0 or (v_line->>'quantity')::numeric<>round((v_line->>'quantity')::numeric,3)
      or (v_line->>'unit_price')::numeric<0 or (v_line->>'amount')::numeric<0
      or (v_line->>'tax_rate')::numeric<0 or (v_line->>'tax_rate')::numeric>1 then
    raise exception '作業明細の数値が不正です' using errcode='22023';
   end if;
  end loop;
 end if;
 if p_customer is not null then
  if jsonb_typeof(p_customer)<>'object' then raise exception '顧客データが不正です' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_customer) k where not(k=any(array['name','kana','phone','mobile_phone','email','postal_code','address','gender','birth_date','customer_type']))) then
   raise exception '変更できない顧客項目が含まれています' using errcode='22023';
  end if;
  if nullif(btrim(p_customer->>'name'),'') is null or nullif(p_customer->>'birth_date','') is null then
   raise exception '顧客名と生年月日は必須です' using errcode='22023';
  end if;
  v_birth_date:=(p_customer->>'birth_date')::date;
  if v_birth_date>current_date then raise exception '生年月日は未来の日付を指定できません' using errcode='22023'; end if;
  insert into public.customers(store_id,name,kana,phone,mobile_phone,email,postal_code,address,gender,birth_date,customer_type)
   values(p_store_id,btrim(p_customer->>'name'),p_customer->>'kana',p_customer->>'phone',p_customer->>'mobile_phone',p_customer->>'email',p_customer->>'postal_code',p_customer->>'address',p_customer->>'gender',v_birth_date,coalesce(nullif(p_customer->>'customer_type',''),'individual'))
   returning id into v_customer_id;
 else
  v_customer_id:=case when p_job ? 'customer_id' then nullif(p_job->>'customer_id','')::uuid else v_job.customer_id end;
  if v_customer_id is not null and not exists(select 1 from public.customers where id=v_customer_id and store_id=p_store_id and deleted_at is null) then
   raise exception '顧客が見つかりません' using errcode='42501';
  end if;
 end if;
 if p_vehicle is not null then
  if jsonb_typeof(p_vehicle)<>'object' then raise exception '車両データが不正です' using errcode='22023'; end if;
  if exists(select 1 from jsonb_object_keys(p_vehicle) k where not(k=any(array['vin','maker','model_name','registration_no','inspection_expiry_date','liability_insurance_expiry_date','management_no']))) then
   raise exception '変更できない車両項目が含まれています' using errcode='22023';
  end if;
  if nullif(btrim(p_vehicle->>'vin'),'') is null or nullif(btrim(p_vehicle->>'model_name'),'') is null then raise exception '車台番号と車名は必須です' using errcode='22023'; end if;
  if not exists(select 1 from public.store_master_entries where store_id=p_store_id and kind='vehicle_maker' and is_active and label=p_vehicle->>'maker') then
   raise exception '有効な車両メーカーを選択してください' using errcode='22023';
  end if;
  insert into public.vehicles(store_id,vin,maker,model_name,registration_no,inspection_expiry_date,liability_insurance_expiry_date,management_no)
   values(p_store_id,btrim(p_vehicle->>'vin'),p_vehicle->>'maker',btrim(p_vehicle->>'model_name'),p_vehicle->>'registration_no',nullif(p_vehicle->>'inspection_expiry_date','')::date,nullif(p_vehicle->>'liability_insurance_expiry_date','')::date,p_vehicle->>'management_no')
   returning id into v_vehicle_id;
 else
  v_vehicle_id:=case when p_job ? 'vehicle_id' then nullif(p_job->>'vehicle_id','')::uuid else v_job.vehicle_id end;
  if v_vehicle_id is not null and not exists(select 1 from public.vehicles where id=v_vehicle_id and store_id=p_store_id and deleted_at is null) then
   raise exception '車両が見つかりません' using errcode='42501';
  end if;
 end if;
 -- Populate only a typed record after strict key validation; no dynamic SQL.
 select * into v_values from jsonb_populate_record(null::public.maintenance_jobs,p_job-'customer_id'-'vehicle_id');
 if p_job_id is null then
  if nullif(btrim(v_values.job_no),'') is null then raise exception '整備番号は必須です' using errcode='22023'; end if;
  insert into public.maintenance_jobs(store_id,job_no,customer_id,vehicle_id)
   values(p_store_id,v_values.job_no,v_customer_id,v_vehicle_id) returning id into v_job_id;
 else v_job_id:=p_job_id;
 end if;
 update public.maintenance_jobs set
 customer_id=v_customer_id,vehicle_id=v_vehicle_id,
 job_no=case when p_job ? 'job_no' then v_values.job_no else maintenance_jobs.job_no end,
 job_type=case when p_job ? 'job_type' then v_values.job_type else maintenance_jobs.job_type end,
 status=case when p_job ? 'status' then v_values.status else maintenance_jobs.status end,
 priority=case when p_job ? 'priority' then v_values.priority else maintenance_jobs.priority end,
 reception_date=case when p_job ? 'reception_date' then v_values.reception_date else maintenance_jobs.reception_date end,
 reception_route=case when p_job ? 'reception_route' then v_values.reception_route else maintenance_jobs.reception_route end,
 assigned_user_name=case when p_job ? 'assigned_user_name' then v_values.assigned_user_name else maintenance_jobs.assigned_user_name end,
 request_detail=case when p_job ? 'request_detail' then v_values.request_detail else maintenance_jobs.request_detail end,
 symptoms=case when p_job ? 'symptoms' then v_values.symptoms else maintenance_jobs.symptoms end,
 work_items=case when p_job ? 'work_items' then v_values.work_items else maintenance_jobs.work_items end,
 planned_parts=case when p_job ? 'planned_parts' then v_values.planned_parts else maintenance_jobs.planned_parts end,
 work_instruction=case when p_job ? 'work_instruction' then v_values.work_instruction else maintenance_jobs.work_instruction end,
 scheduled_in_at=case when p_job ? 'scheduled_in_at' then v_values.scheduled_in_at else maintenance_jobs.scheduled_in_at end,
 scheduled_start_date=case when p_job ? 'scheduled_start_date' then v_values.scheduled_start_date else maintenance_jobs.scheduled_start_date end,
 scheduled_finish_date=case when p_job ? 'scheduled_finish_date' then v_values.scheduled_finish_date else maintenance_jobs.scheduled_finish_date end,
 scheduled_delivery_at=case when p_job ? 'scheduled_delivery_at' then v_values.scheduled_delivery_at else maintenance_jobs.scheduled_delivery_at end,
 actual_in_date=case when p_job ? 'actual_in_date' then v_values.actual_in_date else maintenance_jobs.actual_in_date end,
 actual_finish_date=case when p_job ? 'actual_finish_date' then v_values.actual_finish_date else maintenance_jobs.actual_finish_date end,
 actual_delivery_date=case when p_job ? 'actual_delivery_date' then v_values.actual_delivery_date else maintenance_jobs.actual_delivery_date end,
 loaner_status=case when p_job ? 'loaner_status' then v_values.loaner_status else maintenance_jobs.loaner_status end,
 labor_amount=case when p_job ? 'labor_amount' then v_values.labor_amount else maintenance_jobs.labor_amount end,
 parts_amount=case when p_job ? 'parts_amount' then v_values.parts_amount else maintenance_jobs.parts_amount end,
 inspection_amount=case when p_job ? 'inspection_amount' then v_values.inspection_amount else maintenance_jobs.inspection_amount end,
 legal_fee_amount=case when p_job ? 'legal_fee_amount' then v_values.legal_fee_amount else maintenance_jobs.legal_fee_amount end,
 additional_amount=case when p_job ? 'additional_amount' then v_values.additional_amount else maintenance_jobs.additional_amount end,
 discount_amount=case when p_job ? 'discount_amount' then v_values.discount_amount else maintenance_jobs.discount_amount end,
 estimated_total_amount=case when p_job ? 'estimated_total_amount' then v_values.estimated_total_amount else maintenance_jobs.estimated_total_amount end,
 billing_amount=case when p_job ? 'billing_amount' then v_values.billing_amount else maintenance_jobs.billing_amount end,
 payment_method=case when p_job ? 'payment_method' then v_values.payment_method else maintenance_jobs.payment_method end,
 estimate_confirm_status=case when p_job ? 'estimate_confirm_status' then v_values.estimate_confirm_status else maintenance_jobs.estimate_confirm_status end,
 line_notification_enabled=case when p_job ? 'line_notification_enabled' then v_values.line_notification_enabled else maintenance_jobs.line_notification_enabled end,
 remind_before_enabled=case when p_job ? 'remind_before_enabled' then v_values.remind_before_enabled else maintenance_jobs.remind_before_enabled end,
 remind_before_days=case when p_job ? 'remind_before_days' then v_values.remind_before_days else maintenance_jobs.remind_before_days end,
 estimate_notice_enabled=case when p_job ? 'estimate_notice_enabled' then v_values.estimate_notice_enabled else maintenance_jobs.estimate_notice_enabled end,
 completion_notice_enabled=case when p_job ? 'completion_notice_enabled' then v_values.completion_notice_enabled else maintenance_jobs.completion_notice_enabled end,
 next_inspection_notice_enabled=case when p_job ? 'next_inspection_notice_enabled' then v_values.next_inspection_notice_enabled else maintenance_jobs.next_inspection_notice_enabled end,
 next_inspection_date=case when p_job ? 'next_inspection_date' then v_values.next_inspection_date else maintenance_jobs.next_inspection_date end,
 line_notice_memo=case when p_job ? 'line_notice_memo' then v_values.line_notice_memo else maintenance_jobs.line_notice_memo end,
 work_memo=case when p_job ? 'work_memo' then v_values.work_memo else maintenance_jobs.work_memo end,
 caution_note=case when p_job ? 'caution_note' then v_values.caution_note else maintenance_jobs.caution_note end,
 customer_message=case when p_job ? 'customer_message' then v_values.customer_message else maintenance_jobs.customer_message end,
 work_details=case when p_job ? 'work_details' then v_values.work_details else maintenance_jobs.work_details end,
 work_details_version=case when p_job ? 'work_details_version' then v_values.work_details_version else maintenance_jobs.work_details_version end,
 tax_display_mode=case when p_job ? 'tax_display_mode' then v_values.tax_display_mode else maintenance_jobs.tax_display_mode end,
 discount_input_amount=case when p_job ? 'discount_input_amount' then v_values.discount_input_amount else maintenance_jobs.discount_input_amount end
 where id=v_job_id and store_id=p_store_id;
 if not found then raise exception '整備案件を保存できません' using errcode='42501'; end if;
 return jsonb_build_object('job_id',v_job_id,'customer_id',v_customer_id,'vehicle_id',v_vehicle_id);
end $$;
revoke all on function public.save_maintenance_with_links(uuid,jsonb,jsonb,jsonb,uuid) from public,anon;
grant execute on function public.save_maintenance_with_links(uuid,jsonb,jsonb,jsonb,uuid) to authenticated;
commit;

notify pgrst, 'reload schema';
