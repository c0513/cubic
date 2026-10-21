"""Check that the real-Python mission engine executes scripts and enforces world rules."""
import json
from pathlib import Path
import unittest

CODE=Path(__file__).resolve().parents[1].joinpath('src/python_bootstrap.py').read_text()
ORIGIN=[500,200]

def run_script(code,*,start=None,crystals=None,water=None,bridge=False):
    start=start or ORIGIN
    state={
      'origin':start,'facing':3,'water':water if water is not None else [[500,195]],
      'obstacles':[[504,200]],'crystal':crystals if crystals is not None else [[500,196]],
      'bridgeCell':[500,195],'bridgeBuilt':bridge,'maxRange':15,'boards':3,
    }
    g={'WORLD_STATE_JSON':json.dumps(state),'USER_CODE':code}
    exec(CODE,g)
    return json.loads(g['LAST_RESULT_JSON'])

class TestPythonMission(unittest.TestCase):
    def test_first_steps(self):
        r=run_script('move_forward(3)')
        self.assertTrue(r['ok'],r)
        self.assertEqual([a['z'] for a in r['actions']],[199,198,197])
    def test_collect(self):
        r=run_script('move_forward()\ncollect()',start=[500,197])
        self.assertTrue(r['ok'],r)
        self.assertEqual(r['summary']['collected'],1)
    def test_build_bridge(self):
        r=run_script('place_block()\nmove_forward()',start=[500,196])
        self.assertTrue(r['ok'],r)
        self.assertEqual([x['op'] for x in r['actions']],['place','move'])
    def test_for_loop(self):
        r=run_script('for _ in range(4):\n    move_forward()',start=[500,195],bridge=True)
        self.assertTrue(r['ok'],r)
        self.assertEqual(r['summary']['moved'],4)
    def test_water_collision(self):
        r=run_script('move_forward()',start=[500,196])
        self.assertFalse(r['ok'])
        self.assertIn('вода',r['error'])
    def test_bad_syntax(self):
        r=run_script('for i in range(3)\n  move_forward()')
        self.assertFalse(r['ok']); self.assertIn('строка',r['error'])
    def test_infinite_actions_limit(self):
        r=run_script('for i in range(100):\n    turn_left()')
        self.assertFalse(r['ok']);self.assertIn('Лимит',r['error'])
    def test_boolean_condition(self):
        r=run_script('if front_is_clear():\n    move_forward()\nelse:\n    turn_left()')
        self.assertTrue(r['ok']);self.assertEqual(r['summary']['moved'],1)

if __name__=='__main__':unittest.main()
