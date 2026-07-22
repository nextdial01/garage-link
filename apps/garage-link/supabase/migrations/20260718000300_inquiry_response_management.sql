alter table public.line_form_responses
  add column if not exists response_status text not null default 'unhandled',
  add column if not exists assigned_user_name text,
  add column if not exists next_action_at timestamptz;

alter table public.line_form_responses
  drop constraint if exists line_form_responses_response_status_check;
alter table public.line_form_responses
  add constraint line_form_responses_response_status_check
  check (response_status in ('unhandled', 'in_progress', 'completed'));

create index if not exists line_form_responses_response_queue_idx
  on public.line_form_responses(store_id, response_status, next_action_at, submitted_at desc);

comment on column public.line_form_responses.response_status is
  '問い合わせ対応状態。unhandled=未対応、in_progress=対応中、completed=完了。';
comment on column public.line_form_responses.assigned_user_name is
  '問い合わせ対応担当者の表示名。';
comment on column public.line_form_responses.next_action_at is
  '問い合わせの次回対応予定日時。';
