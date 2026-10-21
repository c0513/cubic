// Pure NPC gate. The character represents a fictional game scene, not a claim about real residents.
export function canMeetGrandma({hasGoal,near,hasParcel,met}){return Boolean(hasGoal&&near&&hasParcel&&!met);}
export function grandmaMessage({hasGoal,near,hasParcel,met}){
  if(met)return '👵 Бабушка: «Спасибо за подарок! Глава 2 — новые приключения по Москве — открыта!»';
  if(!hasGoal)return '👵 Сначала найдём точные координаты дома бабушки.';
  if(!hasParcel)return '👵 Бабушка ждёт посылку. Выполни три городских задания и подними коробку через collect().';
  if(!near)return '👵 Посылка готова. Доберись до дома бабушки с помощью Python!';
  return '👵 Данчезавр, ты пришёл! Нажми «Поговорить с бабушкой», чтобы вручить посылку.';
}
