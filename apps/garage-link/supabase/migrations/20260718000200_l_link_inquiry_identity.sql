alter table public.line_form_responses
  add column if not exists external_source text,
  add column if not exists external_response_id text,
  add column if not exists external_form_id text;

create unique index if not exists line_form_responses_external_identity_uniq
  on public.line_form_responses(store_id, external_source, external_response_id)
  where external_source is not null and external_response_id is not null;

comment on column public.line_form_responses.external_source is
  '外部連携元。L-LINK フォーム回答は l-link。';
comment on column public.line_form_responses.external_response_id is
  '外部サービス側の回答 ID。店舗・連携元との組み合わせで冪等性を担保する。';
comment on column public.line_form_responses.external_form_id is
  '外部サービス側のフォーム ID。';

-- S2S受信ルートはservice_roleで店舗スコープの重複確認と新規登録だけを行う。
grant select, insert on table public.line_form_responses to service_role;
