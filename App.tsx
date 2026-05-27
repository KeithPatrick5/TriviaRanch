import React, { useEffect, useMemo, useRef, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './src/theme/colors';
import { spacing } from './src/theme/spacing';
import { MAIN_CATEGORIES } from './src/data/categories';
import { getDailySeed, questionCount } from './src/engine/questions';
import { BLITZ_DURATION_MS, SURVIVAL_LIVES, buildAnswer, rankFromXp, resultLine } from './src/engine/scoring';
import { GameAnswer, GameMode, GameResult, MainCategory, PlayerStats, Question } from './src/types/game';
import { createChallengeFromSession, ensureAnonymousPlayer, startOfficialGameSession, submitGameResult, submitQuestionReport } from './src/services/triviaApi';

type Screen = 'home' | 'categories' | 'game' | 'result' | 'party-setup' | 'challenge-enter';

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
    body: '60 seconds. Same heat.',
    cta: 'Start',
  },
  survival: {
    title: 'Survival',
    kicker: '3 LIVES',
    body: 'Three lives. Stay alive.',
    cta: 'Enter',
  },
  challenge: {
    title: 'Challenge Run',
    kicker: 'SEND A SCORE',
    body: 'Set the mark. Send it.',
    cta: 'Create',
  },
  'pass-the-phone': {
    title: 'Pass the Phone',
    kicker: 'LOCAL CHAOS',
    body: 'One phone. Table fight.',
    cta: 'Start',
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
  const [challengeEntryCode, setChallengeEntryCode] = useState('');
  const [reportFlash, setReportFlash] = useState(false);
  const finishLockRef = useRef(false);

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
    setReportFlash(false);
    finishLockRef.current = false;
    setPartyTurn(0);
    setPartyPlayers((players) => players.map((player) => ({ ...player, score: 0, correct: 0 })));
    setScreen('game');
  }

  function answerQuestion(selectedIndex: number | null) {
    if (!currentQuestion || finishLockRef.current) return;
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
    if (finishLockRef.current) return;
    finishLockRef.current = true;
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
    setStats((current) => {
      const todayKey = new Date().toISOString().slice(0, 10);
      const playedBlitzToday = current.lastDailyBlitzDate === todayKey;
      return {
        totalGames: current.totalGames + 1,
        totalCorrect: current.totalCorrect + correct,
        totalWrong: current.totalWrong + wrong,
        bestBlitzScore: mode === 'daily-blitz' ? Math.max(current.bestBlitzScore, finalScore) : current.bestBlitzScore,
        bestSurvivalStreak: mode === 'survival' ? Math.max(current.bestSurvivalStreak, finalMaxStreak) : current.bestSurvivalStreak,
        dailyStreak: mode === 'daily-blitz' && !playedBlitzToday ? current.dailyStreak + 1 : current.dailyStreak,
        lastDailyBlitzDate: mode === 'daily-blitz' ? todayKey : current.lastDailyBlitzDate,
        xp: current.xp + Math.floor(finalScore / 10) + correct * 5,
      };
    });
    setScreen('result');
  }

  function reportCurrentQuestion() {
    if (!currentQuestion || reportedQuestionIds.includes(currentQuestion.id)) return;
    const nextReports = [...reportedQuestionIds, currentQuestion.id];
    setReportedQuestionIds(nextReports);
    AsyncStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(nextReports)).catch(() => undefined);
    submitQuestionReport(playerId, currentQuestion.id, mode).catch(() => undefined);
    setReportFlash(true);
    setTimeout(() => setReportFlash(false), 1200);
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

  function submitChallengeCode() {
    const trimmed = challengeEntryCode.trim().toUpperCase();
    if (!trimmed) return;
    Alert.alert('No match found', 'Check the code and try again.');
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
                <Text style={styles.tagline}>FAST TRIVIA FIGHTS</Text>
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
              <Text style={styles.heroBody}>BEST: {stats.bestBlitzScore || 'NEW'}</Text>
              <View style={styles.heroFooter}>
                <Text style={styles.heroCta}>START</Text>
                <Text style={styles.heroMeta}>{questionCount()}Q</Text>
              </View>
            </Pressable>

            <View style={styles.statRow}>
              <Stat label="Games" value={String(stats.totalGames)} />
              <Stat label="Accuracy" value={accuracyLabel(stats)} />
              <Stat label="Streak" value={String(stats.dailyStreak)} />
            </View>

            <Text style={styles.sectionTitle}>FIGHT CARD</Text>
            <ModeCard mode="survival" onPress={() => chooseMode('survival')} />
            <ModeCard mode="challenge" onPress={() => chooseMode('challenge')} />
            <Pressable style={styles.codeEntryCard} onPress={() => setScreen('challenge-enter')}>
              <Text style={styles.modeKicker}>CHASE A CODE</Text>
              <Text style={styles.codeEntryTitle}>Enter Challenge Code</Text>
            </Pressable>
            <ModeCard mode="pass-the-phone" onPress={() => chooseMode('pass-the-phone')} />
          </ScrollView>
        )}

        {screen === 'categories' && (
          <ScrollView contentContainerStyle={styles.page}>
            <Header title={headline.toUpperCase()} subtitle="PICK YOUR LANE" onBack={() => setScreen('home')} />
            <View style={styles.categorySummary}>
              <Text style={styles.categorySummaryTitle}>{modeCopy[mode].kicker}</Text>
              <Text style={styles.categorySummaryText} numberOfLines={1}>{modeCopy[mode].body}</Text>
            </View>
            <View style={styles.categoryList}>
              {MAIN_CATEGORIES.map((item) => (
                <Pressable key={item} style={styles.categoryRow} onPress={() => startGame(item)}>
                  <Text style={styles.categoryInitial}>{item.slice(0, 1)}</Text>
                  <Text style={styles.categoryText} numberOfLines={1}>{item}</Text>
                  <Text style={styles.categoryMeta}>30Q</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        )}

        {screen === 'challenge-enter' && (
          <ScrollView contentContainerStyle={styles.page}>
            <Header title="ENTER CODE" subtitle="CHASE THE MARK" onBack={() => setScreen('home')} />
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Challenge Code</Text>
              <TextInput
                value={challengeEntryCode}
                onChangeText={(value) => setChallengeEntryCode(value.toUpperCase())}
                placeholder="RANCH-1234"
                placeholderTextColor={colors.dim}
                autoCapitalize="characters"
                style={styles.nameInput}
              />
              <Pressable style={styles.primaryAction} onPress={submitChallengeCode}>
                <Text style={styles.primaryActionText}>Chase it</Text>
              </Pressable>
            </View>
          </ScrollView>
        )}

        {screen === 'party-setup' && (
          <ScrollView contentContainerStyle={styles.page}>
            <Header title="PASS THE PHONE" subtitle="TABLE FIGHT" onBack={() => setScreen('home')} />
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
            <Text style={styles.sectionTitle}>CATEGORY</Text>
            <View style={styles.categoryList}>
              {MAIN_CATEGORIES.map((item) => (
                <Pressable key={item} style={styles.categoryRow} onPress={() => startGame(item)}>
                  <Text style={styles.categoryInitial}>{item.slice(0, 1)}</Text>
                  <Text style={styles.categoryText} numberOfLines={1}>{item}</Text>
                  <Text style={styles.categoryMeta}>READY</Text>
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
                <Text style={styles.feedbackText} numberOfLines={1}>{lastAnswer.correct ? `CORRECT +${lastAnswer.points}` : 'MISS'}</Text>
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
            {reportFlash && <Text style={styles.reportFlash}>REPORTED</Text>}
          </View>
        )}

        {screen === 'result' && result && (
          <ScrollView contentContainerStyle={styles.page}>
            <Text style={styles.logoTiny}>RESULT</Text>
            <Text style={styles.resultBurn} numberOfLines={1}>{resultLine(result.mode, result.correct, result.wrong, result.maxStreak)}</Text>
            <View style={styles.resultHero}>
              <Text style={styles.resultScore}>{result.score}</Text>
              <Text style={styles.resultLabel}>FINAL SCORE</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(12, result.correct * 5))}%` }]} />
              </View>
              <Text style={styles.resultXp} numberOfLines={1}>+{Math.floor(result.score / 10) + result.correct * 5} XP · {rankFromXp(stats.xp)}</Text>
            </View>
            <View style={styles.statRow}>
              <Stat label="Correct" value={String(result.correct)} />
              <Stat label="Wrong" value={String(result.wrong)} />
              <Stat label="Max streak" value={String(result.maxStreak)} />
            </View>
            {(result.validationStatus === 'rejected' || result.validationStatus === 'flagged') && (
              <View style={styles.panelCompact}>
                <Text style={styles.panelTitle}>RUN HELD</Text>
                <Text style={styles.muted}>{result.validationStatus === 'rejected' ? 'RUN IT BACK.' : 'POSTED. WATCHED.'}</Text>
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
                <Text style={styles.muted}>SEND IT.</Text>
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
  page: { flexGrow: 1, padding: spacing.lg, gap: spacing.sm, backgroundColor: 'transparent' },
  gamePage: { flex: 1, padding: spacing.lg, gap: spacing.sm, backgroundColor: 'transparent' },
  brandRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  logoTiny: { color: colors.muted, fontSize: 13, fontWeight: '900', letterSpacing: 4 },
  logo: { color: colors.text, fontSize: 41, fontWeight: '900', letterSpacing: 1, lineHeight: 42 },
  tagline: { color: colors.ranchGold, fontSize: 12, fontWeight: '900', marginTop: spacing.xs, letterSpacing: 1.4 },
  rankBadge: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 7, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, alignItems: 'flex-end' },
  rankBadgeTop: { color: colors.ranchGoldBright, fontSize: 12, fontWeight: '900' },
  rankBadgeBottom: { color: colors.muted, fontSize: 10, fontWeight: '800', marginTop: 2 },
  dailyHero: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 9, padding: spacing.md, gap: spacing.sm, borderLeftWidth: 4, borderLeftColor: colors.ranchGold },
  kickerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heroKicker: { color: colors.ranchGoldBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  timerPill: { backgroundColor: colors.danger, borderRadius: 4, paddingHorizontal: spacing.sm, paddingVertical: 5 },
  timerPillText: { color: colors.white, fontSize: 11, fontWeight: '900' },
  heroTitle: { color: colors.text, fontSize: 30, fontWeight: '900', lineHeight: 31, textTransform: 'uppercase' },
  heroBody: { color: colors.textSoft, fontSize: 13, fontWeight: '900', letterSpacing: 0.8 },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: spacing.sm },
  heroCta: { color: colors.bg, backgroundColor: colors.ranchGold, overflow: 'hidden', fontWeight: '900', fontSize: 13, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: 4 },
  heroMeta: { color: colors.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '900', marginTop: spacing.sm, letterSpacing: 2 },
  statRow: { flexDirection: 'row', gap: 1, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 7, overflow: 'hidden' },
  statCard: { flex: 1, backgroundColor: colors.surface, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRightWidth: 1, borderRightColor: colors.borderSoft },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 9, marginTop: 3, textTransform: 'uppercase', fontWeight: '900', letterSpacing: 1 },
  modeCard: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, padding: spacing.md, borderRadius: 8, borderLeftWidth: 3, borderLeftColor: colors.ranchGoldDim },
  modeTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modeKicker: { color: colors.ranchGold, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  modeArrow: { color: colors.ranchGoldBright, fontSize: 18, fontWeight: '900' },
  modeTitle: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 2, textTransform: 'uppercase' },
  modeBody: { color: colors.muted, fontSize: 12, marginTop: 4, lineHeight: 16, fontWeight: '800' },
  modeAction: { color: colors.ranchGoldBright, fontWeight: '900', marginTop: spacing.sm, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  codeEntryCard: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, padding: spacing.md, borderRadius: 6, borderLeftWidth: 3, borderLeftColor: colors.danger },
  codeEntryTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 4, textTransform: 'uppercase' },
  header: { gap: 4, marginBottom: spacing.xs },
  backPill: { alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: 6 },
  back: { color: colors.ranchGoldBright, fontSize: 12, fontWeight: '900', textTransform: 'uppercase' },
  headerTitle: { color: colors.text, fontSize: 30, fontWeight: '900', lineHeight: 32, letterSpacing: 0.5 },
  headerSubtitle: { color: colors.ranchGold, fontSize: 12, fontWeight: '900', letterSpacing: 1.6 },
  categorySummary: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, borderLeftWidth: 4, borderLeftColor: colors.ranchGoldDim },
  categorySummaryTitle: { color: colors.ranchGoldBright, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  categorySummaryText: { color: colors.textSoft, fontSize: 13, fontWeight: '800', marginTop: spacing.xs },
  categoryList: { gap: 6 },
  categoryRow: { minHeight: 52, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 7, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  categoryInitial: { color: colors.bg, backgroundColor: colors.ranchGold, overflow: 'hidden', width: 28, height: 28, borderRadius: 4, textAlign: 'center', lineHeight: 28, fontSize: 15, fontWeight: '900' },
  categoryText: { color: colors.text, fontWeight: '900', fontSize: 15, flex: 1, textTransform: 'uppercase' },
  categoryMeta: { color: colors.muted, fontWeight: '900', fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryCard: { width: '48.7%', minHeight: 92, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 8, padding: spacing.md, justifyContent: 'space-between' },
  panel: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, gap: spacing.sm },
  panelCompact: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, gap: 6 },
  panelHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { color: colors.text, fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  panelBadge: { color: colors.ranchGoldBright, fontWeight: '900', borderWidth: 1, borderColor: colors.borderSoft, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: 4 },
  playerLine: { color: colors.text, fontSize: 14, paddingVertical: 3, fontWeight: '800' },
  nameInput: { color: colors.text, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, borderRadius: 6, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 15, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  smallButton: { flex: 1, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderSoft, padding: spacing.md, borderRadius: 6, alignItems: 'center' },
  smallButtonHot: { backgroundColor: colors.ranchGold, borderColor: colors.ranchGold },
  smallButtonText: { color: colors.text, fontWeight: '900', textTransform: 'uppercase', fontSize: 12, letterSpacing: 1 },
  smallButtonTextHot: { color: colors.bg, fontWeight: '900' },
  gameTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: colors.borderSoft, paddingBottom: spacing.sm },
  eyebrow: { color: colors.ranchGoldBright, fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1.4 },
  progress: { color: colors.muted, fontSize: 11, fontWeight: '800', marginTop: 2, textTransform: 'uppercase' },
  clockBox: { minWidth: 70, alignItems: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 6, paddingVertical: spacing.sm, paddingHorizontal: spacing.md },
  clockBoxHot: { backgroundColor: colors.danger, borderColor: colors.danger },
  timer: { color: colors.text, fontSize: 20, fontWeight: '900' },
  timerHot: { color: colors.white },
  gameStatStrip: { flexDirection: 'row', borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 7, overflow: 'hidden' },
  miniStat: { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.borderSoft },
  miniValue: { color: colors.text, fontSize: 15, fontWeight: '900' },
  miniLabel: { color: colors.muted, fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginTop: 2, letterSpacing: 1 },
  hotText: { color: colors.ranchGoldBright },
  turnText: { color: colors.warning, fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  questionCard: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.md, minHeight: 142, justifyContent: 'center', borderLeftWidth: 4, borderLeftColor: colors.ranchGoldDim },
  questionNumber: { color: colors.ranchGold, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: spacing.sm },
  question: { color: colors.text, fontSize: 23, fontWeight: '900', lineHeight: 29 },
  feedbackPill: { borderRadius: 6, padding: spacing.sm, borderWidth: 1 },
  feedbackGood: { borderColor: colors.success, backgroundColor: colors.successDim },
  feedbackBad: { borderColor: colors.danger, backgroundColor: colors.dangerDim },
  feedbackText: { color: colors.text, fontWeight: '900', fontSize: 12, textTransform: 'uppercase' },
  answerGrid: { gap: 7 },
  answerButton: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderSoft, borderRadius: 7, paddingVertical: 12, paddingHorizontal: spacing.md, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  answerLetter: { color: colors.bg, backgroundColor: colors.ranchGold, overflow: 'hidden', width: 26, height: 26, borderRadius: 4, textAlign: 'center', lineHeight: 26, fontWeight: '900' },
  answerText: { color: colors.text, fontSize: 15, fontWeight: '900', flex: 1 },
  gameActionRow: { marginTop: 'auto', flexDirection: 'row', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSoft, paddingTop: spacing.sm },
  reportButton: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, paddingVertical: spacing.md, borderRadius: 6, alignItems: 'center' },
  reportText: { color: colors.dim, fontWeight: '900', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  reportFlash: { color: colors.ranchGoldBright, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, textAlign: 'center', textTransform: 'uppercase' },
  skipButton: { flex: 1, borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surfaceRaised, paddingVertical: spacing.md, borderRadius: 6, alignItems: 'center' },
  skipText: { color: colors.ranchGoldBright, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  resultBurn: { color: colors.ranchGoldBright, fontSize: 24, fontWeight: '900', lineHeight: 30, letterSpacing: 1.2, textTransform: 'uppercase' },
  resultHero: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 8, padding: spacing.lg, alignItems: 'center', gap: spacing.xs, borderTopWidth: 4, borderTopColor: colors.ranchGoldDim },
  resultScore: { color: colors.text, fontSize: 60, fontWeight: '900', lineHeight: 62 },
  resultLabel: { color: colors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  resultXp: { color: colors.ranchGoldBright, fontWeight: '900', marginTop: spacing.xs, fontSize: 12, letterSpacing: 0.8 },
  progressTrack: { width: '100%', height: 6, backgroundColor: colors.surfaceRaised, borderRadius: 3, marginTop: spacing.sm, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.ranchGold, borderRadius: 2 },
  challengeCode: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  muted: { color: colors.muted, lineHeight: 17, fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 },
  primaryAction: { backgroundColor: colors.ranchGold, borderRadius: 6, padding: spacing.lg, alignItems: 'center' },
  primaryActionText: { color: colors.bg, fontSize: 16, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
  secondaryAction: { borderWidth: 1, borderColor: colors.borderSoft, backgroundColor: colors.surface, borderRadius: 6, padding: spacing.md, alignItems: 'center' },
  secondaryActionText: { color: colors.text, fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 1 },
});
