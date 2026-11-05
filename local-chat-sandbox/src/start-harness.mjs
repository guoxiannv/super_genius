// Diagnostic only; normal npm start now owns the real SDK runtime.
import {HarnessAdapter} from './harness-sdk.mjs';
const adapter=new HarnessAdapter();
try{console.log(await adapter.health());console.log('正式 dsh --profile sdk 已启动；日常使用请运行 npm start，聊天服务会管理 Harness 生命周期。');}finally{await adapter.close();}
