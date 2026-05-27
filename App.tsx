import React, { useEffect, useMemo, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from './src/theme/colors';
import { MAIN_CATEGORIES } from './src/data/categories';
import { getDailySeed, getQuestionSet, questionCount } from './src/engine/questions';
import { BLITZ_DURATION_MS, SURVIVAL_LIVES, buildAnswer, rankFromXp, resultLine } from './src/engine/scoring';
import { GameAnswer, GameMode, GameResult, MainCategory, PlayerStats, Question } from './src/types/game';
import { ensureAnonymousPlayer, loadQuestionSet, submitGameResult, submitQuestionReport } from './src/services/triviaApi';

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

  const currentQuestion = questions[index];
  const remainingMs = Math.max(0, BLITZ_DURATION_MS - (timerNow - startedAt));

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

  const headline = useMemo(() => {
    if (mode === 'daily-blitz') return 'Daily Blitz';
    if (mode === 'survival') return 'Survival';
    if (mode === 'challenge') return 'Challenge Run';
    return 'Pass the Phone';
  }, [mode]);

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
    setQuestions(await loadQuestionSet(nextCategory, count, seed));
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
    };
    setResult(nextResult);
    submitGameResult(playerId, nextResult).catch(() => undefined);
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
      {screen === 'home' && (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.logo}>TRIVIA RANCH</Text>
          <Text style={styles.tagline}>Fast trivia fights. No ads. No mercy.</Text>
          <View style={styles.statRow}>
            <Stat label="Questions" value={String(questionCount())} />
            <Stat label="Rank" value={rankFromXp(stats.xp)} />
            <Stat label="XP" value={String(stats.xp)} />
          </View>
          <ModeCard title="Daily Blitz" body="60 seconds. Same daily heat for everyone." onPress={() => chooseMode('daily-blitz')} />
          <ModeCard title="Survival" body="Three lives. Keep going until you prove yourself or fold." onPress={() => chooseMode('survival')} />
          <ModeCard title="Challenge Run" body="Set a score, then make someone chase it." onPress={() => chooseMode('challenge')} />
          <ModeCard title="Pass the Phone" body="Two to eight players. One phone. Local damage." onPress={() => chooseMode('pass-the-phone')} />
        </ScrollView>
      )}

      {screen === 'categories' && (
        <ScrollView contentContainerStyle={styles.page}>
          <Header title={headline} subtitle="Pick your lane." onBack={() => setScreen('home')} />
          <View style={styles.grid}>
            {MAIN_CATEGORIES.map((item) => (
              <Pressable key={item} style={styles.categoryCard} onPress={() => startGame(item)}>
                <Text style={styles.categoryText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {screen === 'party-setup' && (
        <ScrollView contentContainerStyle={styles.page}>
          <Header title="Pass the Phone" subtitle="Local mode. No account nonsense." onBack={() => setScreen('home')} />
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Players</Text>
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
              <SmallButton title="Add Player" onPress={addPartyPlayer} />
            </View>
          </View>
          <Text style={styles.sectionTitle}>Choose category</Text>
          <View style={styles.grid}>
            {MAIN_CATEGORIES.map((item) => (
              <Pressable key={item} style={styles.categoryCard} onPress={() => startGame(item)}>
                <Text style={styles.categoryText}>{item}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {screen === 'game' && currentQuestion && (
        <View style={styles.page}>
          <View style={styles.gameTopBar}>
            <Text style={styles.eyebrow}>{headline}</Text>
            <Text style={styles.timer}>{mode === 'survival' ? `Lives ${lives}` : `${Math.ceil(remainingMs / 1000)}s`}</Text>
          </View>
          {mode === 'pass-the-phone' && <Text style={styles.turnText}>{partyPlayers[partyTurn]?.name}'s turn</Text>}
          <Text style={styles.progress}>Question {index + 1} / {questions.length} · {category}</Text>
          <View style={styles.questionCard}>
            <Text style={styles.question}>{currentQuestion.question}</Text>
          </View>
          {lastAnswer && (
            <View style={[styles.feedbackPill, lastAnswer.correct ? styles.feedbackGood : styles.feedbackBad]}>
              <Text style={styles.feedbackText}>{lastAnswer.correct ? 'Correct' : currentQuestion.explanation}</Text>
            </View>
          )}
          <View style={styles.answerStack}>
            {currentQuestion.answers.map((answer, answerIndex) => (
              <Pressable key={answer} style={styles.answerButton} onPress={() => answerQuestion(answerIndex)}>
                <Text style={styles.answerText}>{answer}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            style={styles.reportButton}
            onPress={reportCurrentQuestion}
            disabled={reportedQuestionIds.includes(currentQuestion.id)}
          >
            <Text style={styles.reportText}>{reportedQuestionIds.includes(currentQuestion.id) ? 'Reported' : 'Report question'}</Text>
          </Pressable>
          <Pressable style={styles.skipButton} onPress={() => answerQuestion(null)}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
          <View style={styles.gameFooter}>
            <Text style={styles.footerStat}>Score {score}</Text>
            <Text style={styles.footerStat}>Streak {streak}</Text>
            <Text style={styles.footerStat}>Best {maxStreak}</Text>
          </View>
        </View>
      )}

      {screen === 'result' && result && (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.logo}>RESULT</Text>
          <Text style={styles.resultBurn}>{resultLine(result.mode, result.correct, result.wrong, result.maxStreak)}</Text>
          <View style={styles.statRow}>
            <Stat label="Score" value={String(result.score)} />
            <Stat label="Correct" value={String(result.correct)} />
            <Stat label="Streak" value={String(result.maxStreak)} />
          </View>
          {mode === 'pass-the-phone' && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Local Scoreboard</Text>
              {[...partyPlayers].sort((a, b) => b.score - a.score).map((player, place) => (
                <Text key={player.name} style={styles.playerLine}>{place + 1}. {player.name} · {player.score} pts · {player.correct} right</Text>
              ))}
            </View>
          )}
          {mode === 'challenge' && (
            <View style={styles.panel}>
              <Text style={styles.panelTitle}>Challenge Code</Text>
              <Text style={styles.challengeCode}>RANCH-{result.score}-{result.correct}</Text>
              <Text style={styles.muted}>Share this code for now. Backend deep links are scoped as the next online phase.</Text>
            </View>
          )}
          <ModeCard title="Run it back" body="Same mode. Same attitude." onPress={() => startGame(result.category)} />
          <ModeCard title="Home" body="Pick another fight." onPress={() => setScreen('home')} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack}>
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

function ModeCard({ title, body, onPress }: { title: string; body: string; onPress: () => void }) {
  return (
    <Pressable style={styles.modeCard} onPress={onPress}>
      <Text style={styles.modeTitle}>{title}</Text>
      <Text style={styles.modeBody}>{body}</Text>
      <Text style={styles.modeAction}>Start fight →</Text>
    </Pressable>
  );
}

function SmallButton({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable style={styles.smallButton} onPress={onPress}>
      <Text style={styles.smallButtonText}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  page: { flexGrow: 1, padding: 18, gap: 14, backgroundColor: colors.bg },
  logo: { color: colors.text, fontSize: 34, fontWeight: '900', letterSpacing: 1.5 },
  tagline: { color: colors.ranchGold, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  statRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 12, borderRadius: 14 },
  statValue: { color: colors.text, fontSize: 16, fontWeight: '900' },
  statLabel: { color: colors.muted, fontSize: 11, marginTop: 4, textTransform: 'uppercase' },
  modeCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, padding: 16, borderRadius: 16 },
  modeTitle: { color: colors.text, fontSize: 21, fontWeight: '900' },
  modeBody: { color: colors.muted, fontSize: 14, marginTop: 6, lineHeight: 20 },
  modeAction: { color: colors.ranchGold, fontWeight: '900', marginTop: 12 },
  header: { gap: 4, marginBottom: 6 },
  back: { color: colors.ranchGold, fontSize: 15, fontWeight: '800' },
  headerTitle: { color: colors.text, fontSize: 30, fontWeight: '900' },
  headerSubtitle: { color: colors.muted, fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  categoryCard: { width: '47.8%', minHeight: 76, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, borderRadius: 14, padding: 12, justifyContent: 'center' },
  categoryText: { color: colors.text, fontWeight: '900', fontSize: 16 },
  panel: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, borderRadius: 16, padding: 14, gap: 8 },
  panelTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  playerLine: { color: colors.text, fontSize: 15, paddingVertical: 3 },
  nameInput: { color: colors.text, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel2, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  smallButton: { flex: 1, backgroundColor: colors.panel3, padding: 12, borderRadius: 12, alignItems: 'center' },
  smallButtonText: { color: colors.text, fontWeight: '900' },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '900' },
  gameTopBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  eyebrow: { color: colors.ranchGold, fontSize: 14, fontWeight: '900', textTransform: 'uppercase' },
  timer: { color: colors.text, fontSize: 20, fontWeight: '900' },
  turnText: { color: colors.warning, fontSize: 17, fontWeight: '900' },
  progress: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  questionCard: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.panel, borderRadius: 18, padding: 20, minHeight: 150, justifyContent: 'center' },
  question: { color: colors.text, fontSize: 24, fontWeight: '900', lineHeight: 31 },
  feedbackPill: { borderRadius: 12, padding: 12, borderWidth: 1 },
  feedbackGood: { borderColor: colors.good, backgroundColor: colors.goodDim },
  feedbackBad: { borderColor: colors.bad, backgroundColor: colors.badDim },
  feedbackText: { color: colors.text, fontWeight: '900' },
  answerStack: { gap: 10 },
  answerButton: { backgroundColor: colors.panel2, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16 },
  answerText: { color: colors.text, fontSize: 16, fontWeight: '800' },
  reportButton: { alignSelf: 'center', paddingVertical: 6, paddingHorizontal: 18 },
  reportText: { color: colors.dim, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  skipButton: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  skipText: { color: colors.dim, fontWeight: '900' },
  gameFooter: { marginTop: 'auto', flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 12 },
  footerStat: { color: colors.muted, fontWeight: '900' },
  resultBurn: { color: colors.ranchGold, fontSize: 19, fontWeight: '900', lineHeight: 25 },
  challengeCode: { color: colors.text, fontSize: 24, fontWeight: '900', letterSpacing: 1 },
  muted: { color: colors.muted, lineHeight: 20 },
});
