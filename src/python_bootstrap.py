"""Actual Python 3 execution, not a JS command parser.
The scene is simulated in the worker first, then the browser animates accepted commands.
A watchdog in main.js terminates runaway code; limit to 80 game operations.
"""
import contextlib
import io
import json

class WorldError(Exception):
    pass

class Explorer:
    VECTORS = ((1, 0), (0, 1), (-1, 0), (0, -1))

    def __init__(self, state):
        self.x, self.z = state['origin']
        self.start = (self.x, self.z)
        self.heading = state['facing']
        self.water = set(map(tuple, state['water']))
        self.obstacles = set(map(tuple, state['obstacles']))
        self.crystals = set(map(tuple, state['crystal']))
        self.bridge_cell = tuple(state['bridgeCell'])
        self.bridges = {self.bridge_cell} if state['bridgeBuilt'] else set()
        self.action_log = []
        self.collected = 0
        self.placed = 0
        self.traveled = 0
        self.max_range = state['maxRange']
        self.boards = state['boards']

    def forward_cell(self):
        dx, dz = self.VECTORS[self.heading]
        return self.x + dx, self.z + dz

    def front_is_clear(self):
        cell = self.forward_cell()
        return self._valid(cell) and cell not in self.obstacles and (cell not in self.water or cell in self.bridges)

    def is_water_ahead(self):
        cell = self.forward_cell()
        return cell in self.water and cell not in self.bridges

    def crystal_here(self):
        return (self.x, self.z) in self.crystals

    def _valid(self, cell):
        return abs(cell[0] - self.start[0]) <= self.max_range and abs(cell[1] - self.start[1]) <= self.max_range

    def _action(self, op, **kwargs):
        if len(self.action_log) >= 80:
            raise WorldError('Лимит — 80 игровых действий за один запуск. Разбей длинный путь на части.')
        self.action_log.append({'op':op,**kwargs})

    def move_forward(self, steps=1):
        if type(steps) is not int or not 1 <= steps <= 20:
            raise WorldError('Количество шагов должно быть целым числом от 1 до 20.')
        for _ in range(steps):
            if not self.front_is_clear():
                raise WorldError('Впереди препятствие или вода. Попробуй повернуть или построить мост.')
            self.x,self.z=self.forward_cell()
            self.traveled+=1
            self._action('move',x=self.x,z=self.z,facing=self.heading)

    def turn_left(self):
        self.heading=(self.heading+3)%4
        self._action('turn',facing=self.heading)

    def turn_right(self):
        self.heading=(self.heading+1)%4
        self._action('turn',facing=self.heading)

    def place_block(self):
        cell=self.forward_cell()
        if cell not in self.water or cell in self.bridges:
            raise WorldError('Перед героем нет свободной водной клетки для моста.')
        if self.boards<=0:
            raise WorldError('Кончились доски для мостов.')
        self.boards-=1
        self.bridges.add(cell)
        self.placed+=1
        self._action('place',x=cell[0],z=cell[1])

    def collect(self):
        cell=(self.x,self.z)
        if cell not in self.crystals:
            raise WorldError('Здесь нет кристалла. Найди светящийся голубой блок.')
        self.crystals.remove(cell)
        self.collected+=1
        self._action('collect',x=self.x,z=self.z)

world=json.loads(WORLD_STATE_JSON)
hero=Explorer(world)
move_forward=hero.move_forward
turn_left=hero.turn_left
turn_right=hero.turn_right
place_block=hero.place_block
collect=hero.collect
front_is_clear=hero.front_is_clear
is_water_ahead=hero.is_water_ahead
crystal_here=hero.crystal_here

console=io.StringIO()
error=None
try:
    with contextlib.redirect_stdout(console):
        exec(compile(USER_CODE,'main.py','exec'),{
            'hero':hero,
            'move_forward':move_forward, 'turn_left':turn_left,
            'turn_right':turn_right,'place_block':place_block,
            'collect':collect,'front_is_clear':front_is_clear,
            'is_water_ahead':is_water_ahead,'crystal_here':crystal_here,
            '__name__':'__main__'
        })
except SyntaxError as exc:
    error=f'Ошибка Python, строка {exc.lineno}: {exc.msg}'
except WorldError as exc:
    error=str(exc)
except Exception as exc:
    error=f'{type(exc).__name__}: {exc}'
LAST_RESULT_JSON=json.dumps({
    'ok':error is None,
    'error':error,
    'actions':hero.action_log,
    'summary':{'moved':hero.traveled,'collected':hero.collected,'placed':hero.placed},
    'print':console.getvalue()[-1500:]
},ensure_ascii=False)
