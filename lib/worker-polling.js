'use strict';
const {positiveInt}=require('./performance');
// Um timer, uma operacao por vez. Drena fila ativa sem espera artificial.
function startPolling(processOne, {idleMs=1000, errorMs=5000, schedule=setTimeout, cancel=clearTimeout, onError=console.error}={}) {
  let stopped=false,timer=null;
  async function tick(){
    let delay=idleMs;
    try{if(await processOne())delay=0;}catch(error){delay=errorMs;onError('Falha no ciclo do worker:',error.message);}
    if(!stopped)timer=schedule(tick,delay);
  }
  timer=schedule(tick,0);
  return {stop(){stopped=true;if(timer!==null)cancel(timer);}};
}
function fromEnv(processOne,env=process.env){
 return startPolling(processOne,{idleMs:positiveInt(env.SISCOM_POLL_IDLE_MS,1000,60000),errorMs:5000});
}
module.exports={startPolling,fromEnv};
