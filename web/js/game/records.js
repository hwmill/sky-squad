// 최고 기록 (SPEC-v2 4장): 최고 점수 + 최고 도달 스테이지
// 판정만 하는 순수 함수 (저장은 main.js가 localStorage에. 최고 점수 키 'sky:best'와 형식은 1차 그대로)

// prev: { score, stage } 지금까지 기록 / now: { score, stage } 이번 판
// → { score, stage, newScore, newStage } 갱신된 기록과 "새 기록!" 여부
export function updateRecords(prev, now) {
  const ps = Number(prev.score) || 0;
  const pst = Number(prev.stage) || 0;
  const newScore = now.score > ps;
  const newStage = now.stage > pst;
  return {
    score: newScore ? now.score : ps,
    stage: newStage ? now.stage : pst,
    newScore,
    newStage,
  };
}
