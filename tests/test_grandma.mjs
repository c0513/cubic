import test from 'node:test';import assert from 'node:assert/strict';import {canMeetGrandma,grandmaMessage} from '../src/grandma.js';
test('meeting requires exact destination, nearby hero and parcel',()=>{assert.equal(canMeetGrandma({hasGoal:true,near:true,hasParcel:true,met:false}),true);for(const key of ['hasGoal','near','hasParcel']){const a={hasGoal:true,near:true,hasParcel:true,met:false};a[key]=false;assert.equal(canMeetGrandma(a),false);}});
test('reward cannot repeat',()=>assert.equal(canMeetGrandma({hasGoal:true,near:true,hasParcel:true,met:true}),false));
test('Russian dialogue and chapter',()=>assert.match(grandmaMessage({met:true}),/Глава 2/));
