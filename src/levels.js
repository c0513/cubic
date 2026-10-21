export const LEVELS=[
  {icon:'🧭',name:'Первые шаги',subtitle:'Три клетки по карте',topic:'Функции и команды',reward:50,
   story:'Ты стоишь на настоящей карте. Команды Python передвигают тебя по клеткам на север.',task:'Сделай хотя бы 3 шага вперёд.',
   starter:'# Один шаг = одна клетка реальной карты\nmove_forward(3)',hint:'Команда move_forward(3) передвинет тебя на три клетки.',
   solution:'move_forward(3)'},
  {icon:'💎',name:'Добыча кристалла',subtitle:'Найти игровой ресурс',topic:'Действия в пространстве',reward:100,
   story:'Рядом лежит голубой игровой кристалл. Дойди до него и собери.',task:'Передвинься на клетку вперёд и вызови collect().',
   starter:'# Кристалл находится перед тобой\nmove_forward()\ncollect()',hint:'Две команды по порядку: сначала move_forward(), затем collect().',
   solution:'move_forward()\ncollect()'},
  {icon:'🌉',name:'Мост через реку',subtitle:'Строительство кодом',topic:'Комбинирование команд',reward:150,
   story:'На пути игровая водная клетка. Поставь блок и пройди по новому мосту.',task:'Построй мост командой place_block(), затем пройди вперёд.',
   starter:'# Сначала построй, потом иди\nplace_block()\nmove_forward()',hint:'place_block() построит мост перед героем, move_forward() пройдёт на него.',
   solution:'place_block()\nmove_forward()'},
  {icon:'🔁',name:'Алгоритм исследователя',subtitle:'Повторения вместо рутины',topic:'Цикл for, range',reward:200,
   story:'Впереди четыре клетки пути. Сможешь написать короткую программу вместо четырёх одинаковых строк?',
   task:'Используй цикл for, чтобы добраться до светящегося маяка за четыре шага.',
   starter:'# Повтори шаг 4 раза\nfor i in range(4):\n    move_forward()',
   hint:'for i in range(4): — дальше с отступом в четыре пробела move_forward().',
   solution:'for i in range(4):\n    move_forward()'}
];
export const STORAGE_KEY='danchezavr-geo-v1';
