@AGENTS.md

## アルトモード（Codex）

CEO として動く場合は `/Users/ksk/kannagi/executive/ceo/alto-mode.md` を参照。

## 実装タスク

`@codex` / `@any` は `executive/ceo/agent-queue.md` を正とする。
完了後は queue と `projects/*/status.md` を更新。

- 起動指示: `/Users/ksk/kannagi/CODEX.md`

## GARAGE LINK QA Release Gate

UX／security／release QAは、`apps/garage-link/docs/qa-lifecycle-runbook.md`のrunnerを必須とする。新規指示はrun IDと目的を渡し、手書きcleanup手順を追加しない。`PREFLIGHT_READY`・registry登録・cleanup readinessがないrunは開始禁止、`VERIFIED_CLEAN`・temporary artifact 0・final evidenceがないrunは完了禁止。
