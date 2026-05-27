import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './src/theme/colors';
import { spacing } from './src/theme/spacing';
import { MAIN_CATEGORIES } from './src/data/categories';
import { getDailySeed, questionCount } from './src/engine/questions';
import { BLITZ_DURATION_MS, SURVIVAL_LIVES, buildAnswer, rankFromXp, resultLine } from './src/engine/scoring';
import { GameAnswer, GameMode, GameResult, MainCategory, PlayerStats, Question } from './src/types/game';
import { createChallengeFromSession, ensureAnonymousPlayer, startOfficialGameSession, submitGameResult, submitQuestionReport } from './src/services/triviaApi';

type Screen = 'home' | 'categories' | 'game' | 'result' | 'party-setup';

const STATS_STORAGE_KEY = 'trivia-ranch:player-stats:v1';
const REPORT_STORAGE_KEY = 'trivia-ranch:question-reports:v1';
const PLAYER_ID_STORAGE_KEY = 'trivia-ranch:player-id:v1';

type Player = { name: string; score: number; correct: number };

const defaultStats: PlayerStats = {
  totalGames: 0,
  totalCorrect: 0,
  totalWrong: 0,
  bestBlitzScore: 0,
  bestSurvivalStreak: 0,
  dailyStreak: 0,
  xp: 0,
};

const modeCopy: Record<GameMode, { title: string; kicker: string; body: string; cta: string }> = {
  'daily-blitz': {
    title: 'Daily Blitz',
    kicker: 'TODAY\'S HEAT',
    body: '60 seconds. Everyone gets the same heat.',
    cta: 'Start daily run',
  },
  survival: {
    title: 'Survival',
    kicker: '3 LIVES',
    body: 'Three lives. One bad run can end fast.',
    cta: 'Enter survival',
  },
  challenge: {
    title: 'Challenge Run',
    kicker: 'SEND A SCORE',
    body: 'Post a score. Make them answer for it.',
    cta: 'Create challenge',
  },
  'pass-the-phone': {
    title: 'Pass the Phone',
    kicker: 'LOCAL CHAOS',
    body: 'One phone. Two to eight players. No mercy.',
    cta: 'Start party mode',
  },
};

function accuracyLabel(stats: PlayerStats) {
  const total = stats.totalCorrect + stats.totalWrong;
  if (!total) return '0%';
  return `${Math.round((stats.totalCorrect / total) * 100)}%`;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<GameMode>('daily-blitz');
  const [category, setCategory] = useState<MainCategory>('General Knowledge');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<GameAnswer[]>([]);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [lives, setLives] = useState(SURVIVAL_LIVES);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState(Date.now());
  const [result, setResult] = useState<GameResult | null>(null);
  const [stats, setStats] = useState<PlayerStats>(defaultStats);
  const [partyPlayers, setPartyPlayers] = useState<Player[]>([
    { name: 'Player 1', score: 0, correct: 0 },
    { name: 'Player 2', score: 0, correct: 0 },
  ]);
  const [partyTurn, setPartyTurn] = useState(0);
  const [timerNow, setTimerNow] = useState(Date.now());
  const [lastAnswer, setLastAnswer] = useState<GameAnswer | null>(null);
  const [reportedQuestionIds, setReportedQuestionIds] = useState<string[]>([]);
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [playerId, setPlayerId] = useState<string>('local-player');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionSource, setSessionSource] = useState<'edge_function' | 'rest_fallback' | 'local_fallback'>('local_fallback');

  const currentQuestion = questions[index];
  const remainingMs = Math.max(0, BLITZ_DURATION_MS - (timerNow - startedAt));
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const timerHot = mode !== 'survival' && remainingSeconds <= 10;

  useEffect(() => {
    AsyncStorage.getItem(STATS_STORAGE_KEY)
      .then((value) => {
        if (value) setStats({ ...defaultStats, ...JSON.parse(value) });
      })
      .catch(() => undefined)
      .finally(() => setStatsLoaded(true));

    AsyncStorage.getItem(REPORT_STORAGE_KEY)
      .then((value) => {
        if (value) setReportedQuestionIds(JSON.parse(value));
      })
      .catch(() => undefined);

    AsyncStorage.getItem(PLAYER_ID_STORAGE_KEY)
      .then(async (value) => {
        const id = value ?? `anon-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        if (!value) await AsyncStorage.setItem(PLAYER_ID_STORAGE_KEY, id);
        setPlayerId(id);
        ensureAnonymousPlayer(id).catch(() => undefined);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!statsLoaded) return;
    AsyncStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(stats)).catch(() => undefined);
  }, [stats, statsLoaded]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival') return;
    const interval = setInterval(() => setTimerNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [screen, mode, startedAt]);

  useEffect(() => {
    if (screen !== 'game' || mode === 'survival' || !currentQuestion || result) return;
    if (remainingMs <= 0) finishGame(answers, score, maxStreak);
  }, [screen, mode, remainingMs, currentQuestion, result, answers, score, maxStreak]);

  const headline = useMemo(() => modeCopy[mode].title, [mode]);

  function chooseMode(nextMode: GameMode) {
    setMode(nextMode);
    if (nextMode === 'pass-the-phone') {
      setScreen('party-setup');
      return;
    }
    setScreen('categories');
  }

  async function startGame(nextCategory: MainCategory) {
    const seed = mode === 'daily-blitz' ? getDailySeed() : Date.now();
    const count = mode === 'survival' ? 30 : mode === 'pass-the-phone' ? 24 : 20;
    setCategory(nextCategory);
    const officialSession = await startOfficialGameSession(playerId, mode, nextCategory, count, seed);
    setQuestions(officialSession.questions);
    setActiveSessionId(officialSession.sessionId);
    setSessionSource(officialSession.source);
    setIndex(0);
    setAnswers([]);
    setScore(0);
    setStreak(0);
    setMaxStreak(0);
    setLives(SURVIVAL_LIVES);
    setStartedAt(Date.now());
    setQuestionStartedAt(Date.now());
    setTimerNow(Date.now());
    setResult(null);
    setLastAnswer(null);
    setPartyTurn(0);
    setPartyPlayers((players) => players.map((player) => ({ ...player, score: 0, correct: 0 })));
    setScreen('game');
  }

  function answerQuestion(selectedIndex: number | null) {
    if (!currentQuestion) return;
    const elapsedMs = Date.now() - questionStartedAt;
    const answer = buildAnswer(currentQuestion, selectedIndex, elapsedMs, streak);
    Haptics.impactAsync(answer.correct ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);

    const nextAnswers = [...answers, answer];
    setLastAnswer(answer);
    const nextScore = score + answer.points;
    const nextStreak = answer.correct ? streak + 1 : 0;
    const nextMaxStreak = Math.max(maxStreak, nextStreak);
    const nextLives = mode === 'survival' && !answer.correct ? lives - 1 : lives;

    setAnswers(nextAnswers);
    setScore(nextScore);
    setStreak(nextStreak);
    setMaxStreak(nextMaxStreak);
    setLives(nextLives);

    if (mode === 'pass-the-phone') {
      setPartyPlayers((players) =>
        players.map((player, playerIndex) =>
          playerIndex === partyTurn
            ? { ...player, score: player.score + answer.points, correct: player.correct + (answer.correct ? 1 : 0) }
            : player,
        ),
      );
      setPartyTurn((turn) => (turn + 1) % partyPlayers.length);
    }

    const noMoreQuestions = index + 1 >= questions.length;
    const blitzDone = mode !== 'survival' && timerNow - startedAt >= BLITZ_DURATION_MS;
    const survivalDone = mode === 'survival' && nextLives <= 0;

    if (noMoreQuestions || blitzDone || survivalDone) {
      finishGame(nextAnswers, nextScore, nextMaxStreak);
      return;
    }

    setIndex((current) => current + 1);
    setQuestionStartedAt(Date.now());
    setTimerNow(Date.now());
    setTimeout(() => setLastAnswer(null), 450);
  }

  function finishGame(finalAnswers: GameAnswer[], finalScore: number, finalMaxStreak: number) {
    const correct = finalAnswers.filter((answer) => answer.correct).length;
    const wrong = finalAnswers.filter((answer) => !answer.correct && answer.selectedIndex !== null).length;
    const skipped = finalAnswers.filter((answer) => answer.selectedIndex === null).length;
    const nextResult: GameResult = {
      mode,
      category,
      score: finalScore,
      correct,
      wrong,
      skipped,
      maxStreak: finalMaxStreak,
      totalQuestions: finalAnswers.length,
      durationMs: Date.now() - startedAt,
      answers: finalAnswers,
      sessionId: activeSessionId,
      validationStatus: activeSessionId ? 'pending' : 'local_only',
    };
    setResult(nextResult);
    submitGameResult(playerId, nextResult)
      .then(async (official) => {
        let challengeCode = official.challengeCode ?? null;
        if (mode === 'challenge' && activeSessionId && official.status !== 'rejected') {
          const challenge = await createChallengeFromSession(playerId, activeSessionId);
          challengeCode = challenge?.challengeCode ?? challengeCode;
        }
        setResult((current) =>
          current
            ? {
                ...current,
                officialScore: official.officialScore,
                validationStatus: official.status,
                suspicionFlags: official.suspicionFlags,
                challengeCode,
              }
            : current,
        );
      })
      .catch(() => undefined);
    setStats((current) => ({
      totalGames: current.totalGames + 1,
      totalCorrect: current.totalCorrect + correct,
      totalWrong: current.totalWrong + wrong,
      bestBlitzScore: mode === 'daily-blitz' ? Math.max(current.bestBlitzScore, finalScore) : current.bestBlitzScore,
      bestSurvivalStreak: mode === 'survival' ? Math.max(current.bestSurvivalStreak, finalMaxStreak) : current.bestSurvivalStreak,
      dailyStreak: mode === 'daily-blitz' ? current.dailyStreak + 1 : current.dailyStreak,
      xp: current.xp + Math.floor(finalScore / 10) + correct * 5,
    }));
    setScreen('result');
  }

  function reportCurrentQuestion() {
    if (!currentQuestion || reportedQuestionIds.includes(currentQuestion.id)) return;
    const nextReports = [...reportedQuestionIds, currentQuestion.id];
    setReportedQuestionIds(nextReports);
    AsyncStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(nextReports)).catch(() => undefined);
    submitQuestionReport(playerId, currentQuestion.id, mode).catch(() => undefined);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
  }

  function updatePartyPlayerName(playerIndex: number, name: string) {
    setPartyPlayers((players) =>
      players.map((player, index) => (index === playerIndex ? { ...player, name: name || `Player ${index + 1}` } : player)),
    );
  }

  function addPartyPlayer() {
    if (partyPlayers.length >= 8) return;
    setPartyPlayers((players) => [...players, { name: `Player ${players.length + 1}`, score: 0, correct: 0 }]);
  }

  function removePartyPlayer() {
    if (partyPlayers.length <= 2) return;
    setPartyPlayers((players) => players.slice(0, -1));
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={[colors.bg2, colors.bg, colors.bg]} style={styles.appBackdrop}>
        {screen === 'home' && (
          <ScrollView contentContainerStyle={styles.page}>
            <View style={styles.brandRow}>
              <View>
                <Text style={styles.logoTiny}>TRIVIA</Text>
                <Text style={styles.logo}>RANCH</Text>
                <Text style={styles.tagline}>Fast trivia fights. No mercy.</Text>
              </View>
              <View style={styles.rankBadge}>
                <Text style={styles.rankBadgeTop}>{rankFromXp(stats.xp)}</Text>
                <Text style={styles.rankBadgeBottom}>{stats.xp} XP</Text>
              </View>
            </View>

            <Pressable style={styles.dailyHero} onPress={() => chooseMode('daily-blitz')}>
              <View style={styles.kickerRow}>
                <Text style={styles.heroKicker}>TODAY'S HEAT</Text>
                <View style={styles.timerPill}><Text style={styles.timerPillText}>60 SEC</Text></View>
              </View>
              <Text style={styles.heroTitle}>Daily Blitz</Text>
              <Text style={styles.heroBody}>Beat your best: {stats.bestBlitzScore || 'new run'}.</Text>
              <View style={styles.heroFooter}>
                <Text style={styles.heroCta}>Start run →</Text>
                <Text style={styles.heroMeta}>{questionCount()} questions</Text>
              </View>
            </Pressable>

            <View style={styles.statRow}>
              <Stat label="Games" value={String(stats.totalGames)} />
              <Stat label="Accuracy" value={accuracyLabel(stats)} />
              <Stat label="Streak" value={String(stats.dailyStreak)} />
            </View>

            <Text style={styles.sectionTitle}>Pick a fight</Text>
            <ModeCard mode="survival" onPress={() => chooseMode('survival')} />
            <ModeCard mode="challenge" onPress={() => chooseMode('challenge')} />
            <ModeCard mode="pass-the-phone" onPress={() => chooseMode('pass-the-phone')} />
          </ScrollView>
        )}

        {screen === 'categories' && (
          <ScrollView contentContainerStyle={styles.page}>
            <Header title={headline} subtitle="Pick your lane." onBack={() => setScreen('home')} />
            <View style={styles.categorySummary}>
              <Text style={styles.categorySummaryTitle}>{modeCopy[mode].kicker}</Text>
              <Text style={styles.categorySummaryText}>{modeCopy[mode].body}</Text>
            </View>
            <View style={styles.grid}>
              {MAIN_CATEGORIES.map((item) => (
                <Pressable key={item} style={styles.categoryCard} onPress={() => startGame(item)}>
                  <Text style={styles.categoryInitial}>{item.slice(0, 1)}</Text>
                  <Text style={styles.categoryText}>{item}</Text>
                  <Text style={styles.categoryMeta}>30 questions</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {screen === 'party-setup' && (
          <ScrollView contentContainerStyle={styles.page}>
            <Header title="Pass the Phone" subtitle="One phone. Zero mercy." onBack={() => setScreen('home')} />
            <View style={styles.panel}>
              <View style={styles.panelHeaderRow}>
                <Text style={styles.panelTitle}>Players</Text>
                <Text style={styles.panelBadge}>{partyPlayers.length}/8</Text>
              </View>
              {partyPlayers.map((player, playerIndex) => (
                <TextInput
                  key={`party-player-${playerIndex}`}
                  value={player.name}
                  onChangeText={(value) => updatePartyPlayerName(playerIndex, value)}
                  placeholder={`Player ${playerIndex + 1}`}
                  placeholderTextColor={colors.dim}
                  style={styles.nameInput}
                />
              ))}
              <View style={styles.buttonRow}>
                <SmallButton title="Remove" onPress={removePartyPlayer} />
                <SmallButton title="Add Player" onPress={addPartyPlayer} hot />
              </View>
            </View>
            <Text style={styles.sectionTitle}>Choose category</Text>
            <View style={styles.grid}>
              {MAIN_CATEGORIES.map((item) => (
                <Pressable key={item} style={styles.categoryCard} onPress={() => startGame(item)}>
                  <Text style={styles.categoryInitial}>{item.slice(0, 1)}</Text>
                  <Text style={styles.categoryText}>{item}</Text>
                  <Text style={styles.categoryMeta}>Ready</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {screen === 'game' && currentQuestion && (
          <View style={styles.gamePage}>
            <View style={styles.gameTopBar}>
              <View>
                <Text style={styles.eyebrow}>{headline}</Text>
                <Text style={styles.progress}>Q{index + 1}/{questions.length} · {category}</Text>
              </View>
              <View style={[styles.clockBox, timerHot && styles.clockBoxHot]}>
                <Text style={[styles.timer, timerHot && styles.timerHot]}>{mode === 'survival' ? `${lives}♥` : `${remainingSeconds}s`}</Text>
              </View>
            </View>

            <View style={styles.gameStatStrip}>
              <MiniStat label="Score" value={String(score)} />
              <MiniStat label="Streak" value={`x${streak}`} hot={streak >= 3} />
              <MiniStat label="Best" value={`x${maxStreak}`} />
            </View>

            {mode === 'pass-the-phone' && <Text style={styles.turnText}>{partyPlayers[partyTurn]?.name}'s turn</Text>}

            <View style={styles.questionCard}>
              <Text style={styles.questionNumber}>QUESTION {index + 1}</Text>
              <Text style={styles.question}>{currentQuestion.question}</Text>
            </View>

            {lastAnswer && (
              <View style={[styles.feedbackPill, lastAnswer.correct ? styles.feedbackGood : styles.feedbackBad]}>
                <Text style={styles.feedbackText}>{lastAnswer.correct ? `Correct · +${lastAnswer.points}` : currentQuestion.explanation}</Text>
              </View>
            )}

            <View style={styles.answerGrid}>
              {currentQuestion.answers.map((answer, answerIndex) => (
                <Pressable key={answer} style={styles.answerButton} onPress={() => answerQuestion(answerIndex)}>
                  <Text style={styles.answerLetter}>{String.fromCharCode(65 + answerIndex)}</Text>
                  <Text style={styles.answerText}>{answer}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.gameActionRow}>
              <Pressable
                style={styles.reportButton}
                onPress={reportCurrentQuestion}
                disabled={reportedQuestionIds.includes(currentQuestion.id)}
              >
                <Text style={styles.reportText}>{reportedQuestionIds.includes(currentQuestion.id) ? 'Reported' : 'Report'}</Text>
              </Pressable>
              <Pressable style={styles.skipButton} onPress={() => answerQuestion(null)}>
                <Text style={styles.skipText}>Skip</Text>
              </Pressable>
            </View>
          </View>
        )}

        {screen === 'result' && result && (
          <ScrollView contentContainerStyle={styles.page}>
            <Text style={styles.logoTiny}>RESULT</Text>
            <Text style={styles.resultBurn}>{resultLine(result.mode, result.correct, result.wrong, result.maxStreak)}</Text>
            <View style={styles.resultHero}>
              <Text style={styles.resultScore}>{result.score}</Text>
              <Text style={styles.resultLabel}>FINAL SCORE</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(12, result.correct * 5))}%` }]} />
              </View>
              <Text style={styles.resultXp}>+{Math.floor(result.score / 10) + result.correct * 5} XP · {rankFromXp(stats.xp)}</Text>
            </View>
            <View style={styles.statRow}>
              <Stat label="Correct" value={String(result.correct)} />
              <Stat label="Wrong" value={String(result.wrong)} />
              <Stat label="Max streak" value={String(result.maxStreak)} />
            </View>
            {(result.validationStatus === 'rejected' || result.validationStatus === 'flagged') && (
              <View style={styles.panelCompact}>
                <Text style={styles.panelTitle}>Score Review</Text>
                <Text style={styles.muted}>{result.validationStatus === 'rejected' ? 'This run needs another look.' : 'Score posted. Review pending.'}</Text>
              </View>
            )}
            {mode === 'pass-the-phone' && (
              <View style={styles.panelCompact}>
                <Text style={styles.panelTitle}>Scoreboard</Text>
                {[...partyPlayers].sort((a, b) => b.score - a.score).map((player, place) => (
                  <Text key={player.name} style={styles.playerLine}>{place + 1}. {player.name} · {player.score} pts · {player.correct} right</Text>
                ))}
              </View>
            )}
            {mode === 'challenge' && (
              <View style={styles.panelCompact}>
                <Text style={styles.panelTitle}>Challenge Code</Text>
                <Text style={styles.challengeCode}>{result.challengeCode ?? `RANCH-${result.score}-${result.correct}`}</Text>
                <Text style={styles.muted}>Send this code. Make them chase it.</Text>
              </View>
            )}
            <Pressable style={styles.primaryAction} onPress={() => startGame(result.category)}>
              <Text style={styles.primaryActionText}>Run it back</Text>
            </Pressable>
            <Pressable style={styles.secondaryAction} onPress={() => setScreen('home')}>
              <Text style={styles.secondaryActionText}>Change mode</Text>
            </Pressable>
          </ScrollView>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.backPill}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <Text style={styles.headerSubtitle}>{subtitle}</Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function MiniStat({ label, value, hot }: { label: string; value: string; hot?: boolean }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniValue, hot && styles.hotText]}>{value}</Text>
      <Text style={styles.miniLabel}>{label}</Text>
    </View>
  );
}

function ModeCard({ mode, onPress }: { mode: GameMode; onPress: () => void }) {
  const copy = modeCopy[mode];
  return (
    <Pressable style={styles.modeCard} onPress={onPress}>
      <View style={styles.modeTopRow}>
        <Text style={styles.modeKicker}>{copy.kicker}</Text>
        <Text style={styles.modeArrow}>→</Text>
      </View>
      <Text style={styles.modeTitle}>{copy.title}</Text>
      <Text style={styles.modeBody}>{copy.body}</Text>
      <Text style={styles.modeAction}>{copy.cta}</Text>
    </Pressable>
  );
}

function SmallButton({ title, onPress, hot }: { title: string; onPress: () => void; hot?: boolean }) {
  return (
    <Pressable style={[styles.smallButton, hot && styles.smallButtonHot]} onPress={onPress}>
      <Text style={[styles.smallButtonText, hot && styles.smallButtonTextHot]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  appBackdrop: { flex: 1 },
  page: { flexGrow: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: 'transparent' },
  gamePage: { flex: 1, padding: spacing.lg, gap: spacing.md, backgroundColor: 'transparent' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  logoTiny: { color: colors.muted, fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  logo: { color: colors.text, fontSize: 42, fontWeight: '900', letterSpacing: 2, lineHeight: 44 },
  tagline: { color: colors.ranchGoldBright, fontSize: 14, fontWeight: '800', marginTop: spacing.xs },
  rankBadge: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, borderRadius: 16, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'flex-end' },
  rankBadgeTop: { color: colors.ranchGoldBright, fontSize: 13, fontWeight: '900' },
  rankBadgeBottom: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2 },
  dailyHero: { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, gap: spacing.sm, shadowColor: colors.ranchGold, shadowOpacity: 0.2, shadowRadius: 18 },
  kickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroKicker: { color: colors.ranchGoldBright, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  timerPill: { backgroundColor: colors.danger, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  timerPillText: { color: colors.white, fontSize: 12, fontWeight: '900' },
  heroTitle: { color: colors.text, fontSize: 30, fontWeight: '900', lineHeight: 32 },
  heroBody: { color: colors.textSoft, fontSize: 15, fontWeight: '700', lineHeight: 21 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs },
  heroCta: { color: colors.ranchGoldBright, fontWeight: '900', fontSize: 15 },
  heroMeta: { color: colors.muted, fontWeight: '800', fontSize: 12 },
  sectionTitle: { color: colors.text, fontSize: 17, fontWeight: '900', marginTop: spacing.xs },
  statRow: { flexDirection: 'row', gap: spacing.sm },
  statCard: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 16 },
  statValue: { color: colors.text, fontSize: 17, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 10, marginTop: 4, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 0.8 },
  modeCard: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, padding: spacing.md, borderRadius: 18 },
  modeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeKicker: { color: colors.ranchGold, fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  modeArrow: { color: colors.ranchGoldBright, fontSize: 22, fontWeight: '900' },
  modeTitle: { color: colors.text, fontSize: 21, fontWeight: '900', marginTop: 3 },
  modeBody: { color: colors.muted, fontSize: 13, marginTop: 5, lineHeight: 18, fontWeight: '700' },
  modeAction: { color: colors.ranchGoldBright, fontWeight: '900', marginTop: spacing.sm, fontSize: 13 },
  header: { gap: 5, marginBottom: spacing.xs },
  backPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: spacing.md, paddingVertical: 6 },
  back: { color: colors.ranchGoldBright, fontSize: 13, fontWeight: '900' },
  headerTitle: { color: colors.text, fontSize: 31, fontWeight: '900', lineHeight: 34 },
  headerSubtitle: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  categorySummary: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md },
  categorySummaryTitle: { color: colors.ranchGoldBright, fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  categorySummaryText: { color: colors.textSoft, fontSize: 14, fontWeight: '700', marginTop: spacing.xs, lineHeight: 19 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: { width: '48.7%', minHeight: 92, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 18, padding: spacing.md, justifyContent: 'space-between' },
  categoryInitial: { color: colors.ranchGoldBright, fontSize: 20, fontWeight: '900' },
  categoryText: { color: colors.text, fontWeight: '900', fontSize: 15, marginTop: spacing.xs },
  categoryMeta: { color: colors.muted, fontWeight: '800', fontSize: 10, marginTop: spacing.xs, textTransform: 'uppercase' },
  panel: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 20, padding: spacing.md, gap: spacing.sm },
  panelCompact: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, gap: 6 },
  panelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  panelBadge: { color: colors.ranchGoldBright, fontWeight: '900', borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 999 },
  playerLine: { color: colors.text, fontSize: 14, paddingVertical: 3, fontWeight: '800' },
  nameInput: { color: colors.text, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 14, paddingHorizontal: spacing.md, paddingVertical: 11, fontSize: 15, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.md, borderRadius: 14, alignItems: 'center' },
  smallButtonHot: { backgroundColor: colors.ranchGold, borderColor: colors.ranchGoldBright },
  smallButtonText: { color: colors.text, fontWeight: '900' },
  smallButtonTextHot: { color: colors.bg, fontWeight: '900' },
  gameTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.ranchGoldBright, fontSize: 13, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.3 },
  progress: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: 2 },
  clockBox: { minWidth: 74, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  clockBoxHot: { backgroundColor: colors.dangerDim, borderColor: colors.danger },
  timer: { color: colors.text, fontSize: 21, fontWeight: '900' },
  timerHot: { color: colors.white },
  gameStatStrip: { flexDirection: 'row', borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 18, overflow: 'hidden' },
  miniStat: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.borderSoft },
  miniValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  miniLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', marginTop: 2 },
  hotText: { color: colors.ranchGoldBright },
  turnText: { color: colors.warning, fontSize: 16, fontWeight: '900' },
  questionCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 22, padding: spacing.lg, minHeight: 152, justifyContent: 'center' },
  questionNumber: { color: colors.ranchGold, fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginBottom: spacing.sm },
  question: { color: colors.text, fontSize: 24, fontWeight: '900', lineHeight: 31 },
  feedbackPill: { borderRadius: 14, padding: spacing.md, borderWidth: 1 },
  feedbackGood: { borderColor: colors.success, backgroundColor: colors.successDim },
  feedbackBad: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  feedbackText: { color: colors.text, fontWeight: '900', fontSize: 13 },
  answerGrid: { gap: spacing.sm },
  answerButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 16, padding: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  answerLetter: { color: colors.bg, backgroundColor: colors.ranchGold, overflow: 'hidden', width: 28, height: 28, borderRadius: 14, textAlign: 'center', lineHeight: 28, fontWeight: '900' },
  answerText: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
  gameActionRow: { marginTop: 'auto', flexDirection: 'row', gap: spacing.sm },
  reportButton: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: 14, alignItems: 'center' },
  reportText: { color: colors.dim, fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  skipButton: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised, paddingVertical: spacing.md, borderRadius: 14, alignItems: 'center' },
  skipText: { color: colors.ranchGoldBright, fontWeight: '900', textTransform: 'uppercase' },
  resultBurn: { color: colors.ranchGoldBright, fontSize: 21, fontWeight: '900', lineHeight: 28 },
  resultHero: { borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 24, padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  resultScore: { color: colors.text, fontSize: 58, fontWeight: '900', lineHeight: 62 },
  resultLabel: { color: colors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  resultXp: { color: colors.ranchGoldBright, fontWeight: '900', marginTop: spacing.xs },
  progressTrack: { width: '100%', height: 10, backgroundColor: colors.surfaceRaised, borderRadius: 999, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.ranchGold, borderRadius: 999 },
  challengeCode: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  muted: { color: colors.muted, lineHeight: 19, fontSize: 13, fontWeight: '700' },
  primaryAction: { backgroundColor: colors.ranchGold, borderRadius: 18, padding: spacing.lg, alignItems: 'center' },
  primaryActionText: { color: colors.bg, fontSize: 17, fontWeight: '900', textTransform: 'uppercase' },
  secondaryAction: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 18, padding: spacing.md, alignItems: 'center' },
  secondaryActionText: { color: colors.text, fontSize: 15, fontWeight: '900' },
});
