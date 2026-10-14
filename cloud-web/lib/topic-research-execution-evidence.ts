// Internal trust boundary. No caller-supplied JSON, URL, timeout or owner click
// can act as this verifier. Wire a normal authenticated execution terminal reader
// only after it independently checks original claim/task/epoch mapping and the
// complete issued-action inventory. No such server connector exists here yet.
export type TopicExecutionIdentity={owner:string;research_id:string;input_hash:string;claim_sha256:string;epoch:number;execution_id:string|null;claimed_at:string};
export type VerifiedTopicExecutionEnd=TopicExecutionIdentity&{verified:true;verification_source:'authenticated_executor_terminal';receipt_sha256:string;mapping_receipt_sha256:string;mapping_verified:true;complete_action_inventory:true;all_actions_stopped:true;terminal_state:'completed'|'failed'|'cancelled';ended_at:string;observed_at:string;end_reference:string;settled_reference:string;actions:{action_id:string;state:'settled';settled_reference:string}[]};
export async function readVerifiedTopicExecutionEnd(_identity:TopicExecutionIdentity):Promise<{available:boolean;evidence:VerifiedTopicExecutionEnd|null}>{
 // No network fallback, user-submitted terminal record or inferred process ID.
 void _identity;return {available:false,evidence:null};
}
