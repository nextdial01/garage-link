// Only this durable marker proves the command never invoked a Stripe mutation.
export const STRIPE_NOT_ATTEMPTED='addon_stripe_not_attempted';
export type RecoveryOperation={status:string;diagnostic_code?:string|null;operator_action_required?:boolean|null};
export function optionOperationRecovery(operation:RecoveryOperation){
 const operatorRequired=operation.operator_action_required===true||operation.status==='dead_letter'||(operation.status==='failed'&&operation.diagnostic_code!==STRIPE_NOT_ATTEMPTED);
 const status=operatorRequired?'operator_required':operation.status==='completed'?'completed':operation.status==='failed'?'failed':'pending';
 return {status,newIntentAllowed:status==='completed'||status==='failed',operatorRequired,pending:status==='pending'};
}
