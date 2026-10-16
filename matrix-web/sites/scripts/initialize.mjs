// Explicit operator action. Values arrive through stdin, never argv or logs.
try {
  let raw='';for await(const chunk of process.stdin) {raw+=chunk;if(raw.length>8192)throw new Error();}
  const input=JSON.parse(raw),url=new URL(input.origin);
  if(url.origin!==input.origin||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname))) throw new Error();
  if(typeof input.bootstrapSecret!=='string'||!/^[a-zA-Z0-9_-]{32,256}$/.test(input.bootstrapSecret)) throw new Error();
  const response=await fetch(url.origin+'/api/v1/bootstrap',{method:'POST',headers:{Origin:url.origin,Authorization:'Bearer '+input.bootstrapSecret,'Content-Type':'application/json'},body:JSON.stringify({username:input.username,password:input.password}),redirect:'error'});
  if(!response.ok) {console.error('Initialization rejected: HTTP '+response.status);process.exitCode=1;}
  else console.log('Administrator initialization completed. Disable the runtime initialization secret through the supported configuration channel.');
} catch {
  // JSON/URL/Header exceptions can embed their input; never print raw errors.
  console.error('Initialization failed: verify the private stdin input and connection.');
  process.exitCode=1;
}
