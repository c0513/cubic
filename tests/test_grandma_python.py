"""Test NPC dialogue and item-transfer commands with the actual Python runner."""
import json
from pathlib import Path
import unittest

CODE=Path(__file__).resolve().parents[1].joinpath('src/python_bootstrap.py').read_text()

def run_script(code,*,grandma=[500,201],start=[500,200],ready=True,talked=False,delivered=False,crystals=None):
    state={
      'origin':start,'facing':0,'water':[],'obstacles':[], 'crystal':crystals or [],
      'bridgeCell':[999,999],'bridgeBuilt':False,'maxRange':15,'boards':3,
      'grandmaCell':grandma,'grandmaTalked':talked,'packageReady':ready,'packageDelivered':delivered,
    }
    g={'WORLD_STATE_JSON':json.dumps(state),'USER_CODE':code}
    exec(CODE,g)
    return json.loads(g['LAST_RESULT_JSON'])

class TestGrandmaPython(unittest.TestCase):
    def test_meet_and_deliver(self):
        r=run_script('talk()\ngive_package()')
        self.assertTrue(r['ok'],r)
        self.assertEqual([a['op'] for a in r['actions']],['talk','deliver'])
    def test_cannot_deliver_without_talking(self):
        r=run_script('give_package()')
        self.assertFalse(r['ok']);self.assertIn('talk()',r['error'])
    def test_package_required(self):
        r=run_script('talk()\ngive_package()',ready=False)
        self.assertFalse(r['ok']);self.assertIn('посылку',r['error'])
    def test_cannot_talk_from_distance(self):
        r=run_script('talk()',start=[500,195])
        self.assertFalse(r['ok']);self.assertIn('Подойди',r['error'])
    def test_no_npc_if_goal_unverified(self):
        r=run_script('talk()',grandma=None)
        self.assertFalse(r['ok']);self.assertIn('Бабушки здесь нет',r['error'])
    def test_repeated_delivery_rejected(self):
        r=run_script('give_package()',talked=True,delivered=True)
        self.assertFalse(r['ok']);self.assertIn('уже отдал',r['error'])
    def test_collect_new_chapter_key(self):
        r=run_script('move_forward()\ncollect()',crystals=[[501,200]])
        self.assertTrue(r['ok'],r);self.assertEqual(r['actions'][-1]['op'],'collect')
    def test_can_walk_talk_and_deliver_in_one_script(self):
        r=run_script('move_forward()\ntalk()\ngive_package()',grandma=[501,201])
        self.assertTrue(r['ok'],r)

if __name__=='__main__':unittest.main()
