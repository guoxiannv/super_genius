import test from 'node:test';
import assert from 'node:assert/strict';
import {chatView} from '../src/chat-view.mjs';
test('room views omit logs and other rooms, and ignore unrelated log content changes',()=>{
 const d={version:1,people:[],rooms:[{id:'a'},{id:'b'},{id:'deleted',deleted_at:'today'}],messages:[{id:'1',room_id:'a',text:'hello',progress:[{data:'huge log'}]},{id:'2',room_id:'b',text:'private-other-room'},{id:'3',room_id:'deleted',text:'deleted-message'}]};
 const view=chatView(d,'a',{});assert.equal(view.messages.length,1);assert.equal(view.messages[0].progress,undefined);assert.equal(view.messages[0].progress_count,1);assert.equal(view.deletedRooms.length,1);assert.equal(view.rooms.length,2);
 d.messages[0].progress[0].data='different log';assert.equal(chatView(d,'a',{}).revision,view.revision);
 d.messages[0].text='new reply';assert.notEqual(chatView(d,'a',{}).revision,view.revision);
});
