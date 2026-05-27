export type TrustedAnswer = {
  questionId: string;
  selectedIndex: number | null;
  elapsedMs: number;
  clientPoints?: number;
};

export type TrustedQuestion = {
  id: string;
  correct_index: number;
};

export function scoreAnswer(correct: boolean, elapsedMs: number, streakBefore: number): number {
  if (!correct) return 0;
  const speedBonus = Math.max(0, 50 - Math.floor(elapsedMs / 250));
  const streakBonus = streakBefore >= 9 ? 100 : streakBefore >= 4 ? 50 : streakBefore >= 2 ? 25 : 0;
  return 100 + speedBonus + streakBonus;
}

export function validateAndScore(
  assignedQuestionIds: string[],
  questions: TrustedQuestion[],
  answers: TrustedAnswer[],
  clientScore: number,
  durationMs: number,
) {
  const flags: string[] = [];
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const assignedSet = new Set(assignedQuestionIds);
  const seenAnswers = new Set<string>();

  if (!Array.isArray(answers)) flags.push('answers_not_array');
  if (answers.length > assignedQuestionIds.length) flags.push('too_many_answers');
  if (durationMs < 500 && answers.length > 1) flags.push('duration_impossibly_short');

  let officialScore = 0;
  let correct = 0;
  let wrong = 0;
  let skipped = 0;
  let streak = 0;
  let maxStreak = 0;
  let fastAnswers = 0;

  for (const answer of answers) {
    if (!answer || typeof answer.questionId !== 'string') {
      flags.push('malformed_answer');
      continue;
    }

    if (seenAnswers.has(answer.questionId)) flags.push('duplicate_answer_question');
    seenAnswers.add(answer.questionId);

    if (!assignedSet.has(answer.questionId)) {
      flags.push('answer_not_in_assigned_set');
      continue;
    }

    const question = questionById.get(answer.questionId);
    if (!question) {
      flags.push('assigned_question_missing');
      continue;
    }

    const elapsed = Number.isFinite(answer.elapsedMs) ? Math.max(0, Math.floor(answer.elapsedMs)) : 0;
    if (elapsed < 120 && answer.selectedIndex !== null) fastAnswers += 1;
    if (elapsed > 120_000) flags.push('answer_elapsed_too_large');

    if (answer.selectedIndex === null) {
      skipped += 1;
      streak = 0;
      continue;
    }

    if (![0, 1, 2, 3].includes(answer.selectedIndex)) {
      flags.push('selected_index_out_of_range');
      wrong += 1;
      streak = 0;
      continue;
    }

    const isCorrect = answer.selectedIndex === question.correct_index;
    const points = scoreAnswer(isCorrect, elapsed, streak);
    officialScore += points;

    if (isCorrect) {
      correct += 1;
      streak += 1;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      wrong += 1;
      streak = 0;
    }
  }

  if (fastAnswers >= 5) flags.push('too_many_sub_120ms_answers');
  if (Math.abs((clientScore ?? 0) - officialScore) > 25) flags.push('client_score_mismatch');
  if (correct + wrong + skipped !== answers.length) flags.push('answer_count_mismatch');

  const validationStatus = flags.some((flag) => ['answer_not_in_assigned_set', 'too_many_answers', 'malformed_answer'].includes(flag))
    ? 'rejected'
    : flags.length
      ? 'flagged'
      : 'official';

  return { officialScore, correct, wrong, skipped, maxStreak, flags, validationStatus };
}
