/** 작중 시각을 가진 것(사건). 상위 기간은 고르지 않았을 수 있다. */
type HasDisplayTime = {
  era: { name: string } | null;
  displayTime: string;
};

/**
 * 작중 시각을 한 줄로 합친다. 예: "제3 성력 - 789년"
 *
 * 상위 기간이 없으면 하위만 보여준다. 화면마다 다르게 조합하면 같은 사건이
 * 곳에 따라 다르게 보이므로 한 곳에서만 만든다.
 */
export function formatDisplayTime(event: HasDisplayTime): string {
  const era = event.era?.name.trim();
  return era ? `${era} - ${event.displayTime}` : event.displayTime;
}

/**
 * 격자에서 같은 행으로 묶을지 판단하는 값.
 *
 * 상위·하위가 모두 같아야 동시간대로 본다. 상위가 다른데 하위 이름만 겹치는
 * 경우("제3 성력 - 1년"과 "제4 성력 - 1년")를 한 행에 묶으면 안 된다.
 */
export function displayTimeKey(event: HasDisplayTime): string {
  return `${event.era?.name.trim() ?? ""} ${event.displayTime}`;
}
