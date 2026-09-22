// Positive matches escalate review. A negative match is never proof of no egress:
// scripts and subprocesses can hide network or service access behind any name.
const EXTERNAL_HINT = /\b(curl|docker|https?|kubectl|llm|mcp|mongo|mysql|oauth|openai|postgres|provider|redis|requests|socket|ssh|urllib|uvicorn)\b/i

export function hasExternalHint(material) {
  return typeof material === 'string' && EXTERNAL_HINT.test(material)
}
