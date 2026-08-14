const NON_DELIVERABLE_QA_DOMAINS=new Set([
  'example.invalid','example.com','example.net','example.org',
  'localhost','mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com',
]);
export const CONTROLLED_AUTH_EMAIL_CONTRACT='custom_smtp_tokenhash_v1';
export const STAGING_DEFAULT_SMTP_TOKENHASH_CONTRACT='staging_default_smtp_tokenhash_v1';

function fail(code){throw new Error(code)}

function normalizeEmail(value){return String(value??'').trim().toLowerCase()}

// This module deliberately has no SDK imports: the GitHub transport-state job
// runs before dependency installation and must reject invalid recipients before
// it can cause a Supabase Auth email send.
export function validateActualEmailTransportRecipient(value){
  const email=normalizeEmail(value);
  const match=/^([^@+\s]+)(?:\+[^@\s]*)?@([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/i.exec(email);
  if(!match)fail('EMAIL_TRANSPORT_NOT_CONFIGURED:INVALID_RECIPIENT');
  const [,localPart,domain]=match;
  if(NON_DELIVERABLE_QA_DOMAINS.has(domain)||domain.endsWith('.localhost'))fail('EMAIL_TRANSPORT_NOT_CONFIGURED:NON_DELIVERABLE_RECIPIENT');
  return {emailAddress:`${localPart}@${domain}`,recipient:'REDACTED_APPROVED_QA_MAILBOX',plusAddressing:false};
}

// Recipient syntax alone is not evidence that a real customer-facing Auth
// email can be delivered. The custom SMTP contract remains the default. The
// Staging default-SMTP contract below needs an explicit caller opt-in, so it
// can never become an accidental customer-facing fallback.
export function validateControlledAuthEmailTransportContract(value,{allowStagingDefaultSmtp=false}={}){
  const contract=String(value??'').trim();
  if(contract===CONTROLLED_AUTH_EMAIL_CONTRACT)return {contract,default_smtp:false};
  // This is an explicit Staging-only QA exception.  Callers must opt in rather
  // than treating a default SMTP fallback as a customer-facing transport.
  if(contract===STAGING_DEFAULT_SMTP_TOKENHASH_CONTRACT&&allowStagingDefaultSmtp===true){
    return {contract,default_smtp:true};
  }
  fail('EMAIL_TRANSPORT_NOT_CONFIGURED:CONTROLLED_AUTH_EMAIL_CONTRACT_REQUIRED');
}

export function validateControlledAuthConfirmOrigin(value){
  try {
    const origin=new URL(String(value??'').trim());
    if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||!/(?:^|\.)garage-link\.tech$/i.test(origin.hostname)){
      fail('EMAIL_TRANSPORT_NOT_CONFIGURED:CONTROLLED_CONFIRM_ORIGIN_REQUIRED');
    }
    return {origin:origin.origin};
  } catch(error) {
    if(String(error?.message??'').startsWith('EMAIL_TRANSPORT_NOT_CONFIGURED:'))throw error;
    fail('EMAIL_TRANSPORT_NOT_CONFIGURED:CONTROLLED_CONFIRM_ORIGIN_REQUIRED');
  }
}
