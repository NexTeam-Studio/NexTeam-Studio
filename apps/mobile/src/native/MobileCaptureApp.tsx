import React, { useEffect, useMemo, useRef, useState } from "react";
import AsyncStorageModule, { type AsyncStorageStatic } from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Audio } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { EncodingType, copyAsync, documentDirectory, makeDirectoryAsync, readAsStringAsync } from "expo-file-system/legacy";
import * as Location from "expo-location";
import { ActivityIndicator, Alert, AppState, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LOCAL_DEV_PROFILES, createLocalDevSession, currentMobileIdToken, mobileSessionFromAccess, restoreLocalDevSession, saveLocalDevSession, signInMobileFirebase, signOutMobileFirebase, type DevHeaderProfile } from "./auth.js";
import { CaptureApiClient, type MobileDayBoard, type MobileDayBoardVisit, type MobileLocalProfile, type MobileSessionBootstrap, type MobileVisitContext } from "./captureApi.js";
import { deriveSessionSyncStatus, findCaptureSuggestion, sessionHasQueuedWork, shouldReauthenticate } from "./captureHelpers.js";
import { captureNarrationDraftSchema, capturePhotoDraftSchema, captureSessionDraftSchema, type CaptureAnnotation, type CaptureChecklistDraft, type CaptureChecklistFieldUpdate, type CapturePhotoDraft, type CaptureRequestDraft, type CaptureSessionDraft, type MobileRuntimeConfig, type MobileSession } from "./captureModels.js";
import { queueSummary, syncQueuedSessions } from "./captureQueue.js";
import { AsyncStorageCaptureSessionStore } from "./captureSessionStore.js";
import { fetchMobileRuntimeConfig } from "./runtimeConfig.js";

const CAPTURE_STORE = new AsyncStorageCaptureSessionStore();
const DAY_BOARD_CACHE_KEY = "nexteam.mobile.dayBoard";
const DEFAULT_LOCAL_PROFILE_ID = "tech_chris";
const CAPTURE_FILE_DIR = `${documentDirectory ?? "file:///data/"}mobile-capture`;
const SYNC_POLL_MS = 15_000;
const AsyncStorage = AsyncStorageModule as unknown as AsyncStorageStatic;

type AuthMode = "booting" | "ready" | "sign_in";
type CaptureRouteStep = "chooser" | "existing" | "request";
type VoiceTarget = { kind: "visit" } | { kind: "photo"; photoId: string };

type PersistedDayBoard = {
  date: string;
  cachedAt: string;
  board: MobileDayBoard;
};

type RequestDraftState = CaptureRequestDraft;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoNow(): string {
  return new Date().toISOString();
}

function defaultRequestDraft(): RequestDraftState {
  return {
    clientName: "",
    email: "",
    phone: "",
    propertyStreet1: "",
    propertyCity: "",
    propertyProvince: "",
    propertyPostalCode: "",
    issueSummary: "",
    gateCode: "",
    petPresent: false,
    petName: "",
    poolType: ""
  };
}

function toProfileId(profile: DevHeaderProfile | MobileLocalProfile): string {
  return "id" in profile ? profile.id : profile.tenantUserId;
}

function roleSummary(session: MobileSession | null): string {
  if (!session) {
    return "";
  }
  return session.role === "TECHNICIAN" ? "Tech" : session.role === "OFFICE_ADMIN" ? "Office" : "Owner";
}

function formatWindow(start: string, end: string): string {
  const startAt = new Date(start);
  const endAt = new Date(end);
  return `${startAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} - ${endAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function sessionHeadline(session: CaptureSessionDraft): string {
  if (session.assignment?.mode === "request" && session.assignment.requestDraft?.clientName) {
    return `New client: ${session.assignment.requestDraft.clientName}`;
  }
  if (session.visit?.clientName) {
    return session.visit.clientName;
  }
  if (session.suggestion?.clientName) {
    return session.suggestion.clientName;
  }
  return "Unassigned capture";
}

function makeRequestDraftFromSuggestion(session: CaptureSessionDraft): RequestDraftState {
  const visit = session.visit;
  return {
    ...defaultRequestDraft(),
    clientName: visit?.clientName ?? session.assignment?.requestDraft?.clientName ?? "",
    propertyStreet1: visit?.serviceAddress.line1 ?? session.assignment?.requestDraft?.propertyStreet1 ?? "",
    propertyCity: visit?.serviceAddress.city ?? session.assignment?.requestDraft?.propertyCity ?? "",
    propertyProvince: visit?.serviceAddress.state ?? session.assignment?.requestDraft?.propertyProvince ?? "",
    propertyPostalCode: visit?.serviceAddress.postalCode ?? session.assignment?.requestDraft?.propertyPostalCode ?? "",
    issueSummary: session.assignment?.requestDraft?.issueSummary ?? "Field capture intake",
    gateCode: visit?.notes.gateCode ?? session.assignment?.requestDraft?.gateCode ?? "",
    petPresent: visit?.notes.petPresent ?? session.assignment?.requestDraft?.petPresent ?? false,
    petName: visit?.notes.petName ?? session.assignment?.requestDraft?.petName ?? "",
    poolType: visit?.notes.poolType ?? session.assignment?.requestDraft?.poolType ?? ""
  };
}

function suggestionSummary(match: ReturnType<typeof findCaptureSuggestion> | null | undefined): CaptureSessionDraft["suggestion"] | undefined {
  if (!match) {
    return undefined;
  }
  return {
    clientId: match.candidate.clientId ?? null,
    clientName: match.candidate.clientName ?? null,
    ...(match.candidate.propertyId !== undefined ? { propertyId: match.candidate.propertyId } : {}),
    ...(match.candidate.propertyName !== undefined ? { propertyName: match.candidate.propertyName } : {}),
    ...(match.candidate.jobId !== undefined ? { jobId: match.candidate.jobId } : {}),
    ...(match.candidate.visitId !== undefined ? { visitId: match.candidate.visitId } : {}),
    serviceAddress: match.candidate.serviceAddress,
    distanceMeters: match.distanceMeters,
    matchedBy: match.matchedBy
  };
}

function emptySession(input: {
  tenantId: string;
  actorTenantUserId: string;
  visit?: MobileDayBoardVisit | undefined;
  suggestion?: ReturnType<typeof findCaptureSuggestion> | undefined;
  checklists?: CaptureChecklistDraft[] | undefined;
  assignment?: CaptureSessionDraft["assignment"] | undefined;
  routeState?: CaptureSessionDraft["routeState"] | undefined;
}): CaptureSessionDraft {
  const timestamp = isoNow();
  const suggestion = suggestionSummary(input.suggestion);
  return captureSessionDraftSchema.parse({
    id: `capture_session_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    tenantId: input.tenantId,
    actorTenantUserId: input.actorTenantUserId,
    routeState: input.routeState ?? "fresh",
    ...(input.visit ? { visit: input.visit } : {}),
    ...(suggestion ? { suggestion } : {}),
    suggestionAccepted: Boolean(input.assignment?.visitId),
    ...(input.assignment ? { assignment: input.assignment } : {}),
    visitNarrations: [],
    photos: [],
    checklists: input.checklists ?? [],
    syncStatus: "draft",
    failureCount: 0,
    createdAt: timestamp,
    updatedAt: timestamp
  });
}

function existingAssignmentFromVisit(visit: MobileDayBoardVisit): CaptureSessionDraft["assignment"] {
  return {
    mode: "existing_client",
    ...(visit.clientId ? { clientId: visit.clientId } : {}),
    jobId: visit.jobId,
    visitId: visit.id
  };
}



function selectedProfileId(session: MobileSession | null): string {
  return session?.tenantUserId ?? DEFAULT_LOCAL_PROFILE_ID;
}

function checklistDraftsFromContext(context: MobileVisitContext): CaptureChecklistDraft[] {
  const timestamp = isoNow();
  return context.checklists.map((checklist) => ({
    id: `draft_${checklist.id}`,
    remoteChecklistId: checklist.id,
    templateId: checklist.templateId,
    jobId: context.job.id,
    visitId: context.visit.id,
    propertyId: context.property?.id,
    updates: [],
    sectionStateUpdates: [],
    complete: false,
    syncStatus: "draft",
    updatedAt: timestamp
  }));
}

function overlayUriForCandidate(
  candidateId: string | null,
  context: MobileVisitContext | null,
  session: CaptureSessionDraft | null,
  api: CaptureApiClient | null
): string | null {
  if (!candidateId || !api || !context || !session) {
    return null;
  }
  const remoteCandidate = context.beforeAfterCandidates.find((candidate) => candidate.id === candidateId);
  if (remoteCandidate) {
    return api.mediaUrl(session.tenantId, remoteCandidate.id);
  }
  return session.photos.find((photo) => photo.id === candidateId)?.previewUri ?? null;
}

function activeChecklistDraft(session: CaptureSessionDraft | null, checklistId: string | null): CaptureChecklistDraft | null {
  if (!session || !checklistId) {
    return null;
  }
  return session.checklists.find((checklist) => checklist.remoteChecklistId === checklistId || checklist.id === checklistId) ?? null;
}

function mergedChecklistField(
  context: MobileVisitContext | null,
  checklistId: string,
  fieldId: string,
  draft: CaptureChecklistDraft | null
): MobileVisitContext["checklists"][number]["fields"][number] | null {
  const checklist = context?.checklists.find((item) => item.id === checklistId);
  const field = checklist?.fields.find((item) => item.fieldId === fieldId);
  if (!field) {
    return null;
  }
  const update = draft?.updates.find((item) => item.fieldId === fieldId);
  if (!update) {
    return field;
  }
  return {
    ...field,
    ...(update.status !== undefined ? { status: update.status } : {}),
    ...(update.note !== undefined ? { note: update.note } : {}),
    ...(update.numberValue !== undefined ? { numberValue: update.numberValue } : {}),
    ...(update.multiValue !== undefined ? { multiValue: update.multiValue } : {}),
    ...(update.mediaIds !== undefined ? { mediaIds: update.mediaIds } : {}),
    ...(update.photoRequired !== undefined ? { photoRequired: update.photoRequired } : {})
  };
}

function checklistCompletionErrors(
  context: MobileVisitContext | null,
  checklistId: string,
  draft: CaptureChecklistDraft | null
): string[] {
  const checklist = context?.checklists.find((item) => item.id === checklistId);
  if (!checklist) {
    return [];
  }
  return checklist.fields.flatMap((field) => {
    const merged = mergedChecklistField(context, checklistId, field.fieldId, draft);
    if (!merged) {
      return [];
    }
    if (merged.type === "photo_attachment" || merged.photoRequired) {
      const update = draft?.updates.find((item) => item.fieldId === field.fieldId);
      const photoCount = (merged.mediaIds?.length ?? 0) + (update?.localPhotoIds?.length ?? 0);
      return photoCount > 0 ? [] : [`${merged.label}: attach at least one photo.`];
    }
    if (merged.required && merged.type === "free_text" && !(merged.note?.trim())) {
      return [`${merged.label}: add a note before completing.`];
    }
    return [];
  });
}

async function ensureCaptureDirectory(): Promise<void> {
  await makeDirectoryAsync(CAPTURE_FILE_DIR, { intermediates: true });
}

async function persistLocalFile(sourceUri: string, fileName: string): Promise<string> {
  await ensureCaptureDirectory();
  const destination = `${CAPTURE_FILE_DIR}/${fileName}`;
  await copyAsync({ from: sourceUri, to: destination });
  return destination;
}

async function readFileAsBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: EncodingType.Base64 });
}

async function loadCachedBoard(): Promise<MobileDayBoard | null> {
  const raw = await AsyncStorage.getItem(DAY_BOARD_CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PersistedDayBoard;
    return parsed.board;
  } catch {
    return null;
  }
}

async function saveCachedBoard(board: MobileDayBoard): Promise<void> {
  const payload: PersistedDayBoard = {
    date: board.date,
    cachedAt: isoNow(),
    board
  };
  await AsyncStorage.setItem(DAY_BOARD_CACHE_KEY, JSON.stringify(payload));
}

async function currentGps(): Promise<{ latitude: number; longitude: number; accuracyMeters?: number | undefined } | undefined> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    return undefined;
  }
  const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    ...(typeof position.coords.accuracy === "number" ? { accuracyMeters: position.coords.accuracy } : {})
  };
}

async function maybeSuggestedMatch(
  board: MobileDayBoard | null,
  point: { latitude: number; longitude: number; accuracyMeters?: number | undefined } | undefined
): Promise<ReturnType<typeof findCaptureSuggestion> | null> {
  if (!board || !point) {
    return null;
  }
  return findCaptureSuggestion(point, board.suggestionCandidates);
}

function buildAnnotationPanResponder(input: {
  disabled: boolean;
  onCommit: (points: CaptureAnnotation["points"]) => void;
  bounds: { width: number; height: number };
}): ReturnType<typeof PanResponder.create> {
  const points: CaptureAnnotation["points"] = [];
  const normalizedPoint = (x: number, y: number) => ({
    x: Math.max(0, Math.min(1, x / Math.max(1, input.bounds.width))),
    y: Math.max(0, Math.min(1, y / Math.max(1, input.bounds.height)))
  });
  return PanResponder.create({
    onStartShouldSetPanResponder: () => !input.disabled,
    onMoveShouldSetPanResponder: () => !input.disabled,
    onPanResponderGrant: (event) => {
      points.splice(0, points.length, normalizedPoint(event.nativeEvent.locationX, event.nativeEvent.locationY));
    },
    onPanResponderMove: (event) => {
      points.push(normalizedPoint(event.nativeEvent.locationX, event.nativeEvent.locationY));
    },
    onPanResponderRelease: () => {
      if (points.length >= 2) {
        input.onCommit([...points]);
      }
      points.splice(0, points.length);
    }
  });
}

export default function MobileCaptureApp(): React.ReactElement {
  const [authMode, setAuthMode] = useState<AuthMode>("booting");
  const [runtime, setRuntime] = useState<MobileRuntimeConfig | null>(null);
  const [mobileSession, setMobileSession] = useState<MobileSession | null>(null);
  const [sessionBootstrap, setSessionBootstrap] = useState<MobileSessionBootstrap | null>(null);
  const [dayBoard, setDayBoard] = useState<MobileDayBoard | null>(null);
  const [captureSessions, setCaptureSessions] = useState<CaptureSessionDraft[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [visitContexts, setVisitContexts] = useState<Record<string, MobileVisitContext>>({});
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [networkOnline, setNetworkOnline] = useState(true);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [selectedDevProfileId, setSelectedDevProfileId] = useState(DEFAULT_LOCAL_PROFILE_ID);
  const [capturePermission, requestCapturePermission] = useCameraPermissions();
  const [cameraReady, setCameraReady] = useState(false);
  const [nextPairingRole, setNextPairingRole] = useState<"before" | "after" | null>(null);
  const [nextOverlayCandidateId, setNextOverlayCandidateId] = useState<string | null>(null);
  const [editingPhotoId, setEditingPhotoId] = useState<string | null>(null);
  const [routeStep, setRouteStep] = useState<CaptureRouteStep | null>(null);
  const [requestDraft, setRequestDraft] = useState<RequestDraftState>(defaultRequestDraft());
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [voiceTarget, setVoiceTarget] = useState<VoiceTarget | null>(null);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [typedVisitNarration, setTypedVisitNarration] = useState("");
  const [typedPhotoNarration, setTypedPhotoNarration] = useState("");
  const cameraRef = useRef<CameraView | null>(null);

  const activeSession = useMemo(
    () => captureSessions.find((session) => session.id === activeSessionId) ?? null,
    [captureSessions, activeSessionId]
  );
  const activeVisitContext = useMemo(
    () => activeSession?.visit?.id ? visitContexts[activeSession.visit.id] ?? null : null,
    [activeSession, visitContexts]
  );
  const editingPhoto = useMemo(
    () => activeSession?.photos.find((photo) => photo.id === editingPhotoId) ?? null,
    [activeSession, editingPhotoId]
  );
  const activeChecklistDraftValue = useMemo(
    () => activeChecklistDraft(activeSession, checklistId),
    [activeSession, checklistId]
  );
  const overlayUri = useMemo(
    () => overlayUriForCandidate(nextOverlayCandidateId, activeVisitContext, activeSession, apiClient(runtime, mobileSession)),
    [nextOverlayCandidateId, activeVisitContext, activeSession, runtime, mobileSession]
  );
  const queue = useMemo(() => queueSummary(captureSessions), [captureSessions]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setNetworkOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (!runtime || !mobileSession) {
      return;
    }
    let cancelled = false;
    const interval = setInterval(() => {
      if (!cancelled) {
        void syncNow("auto");
      }
    }, SYNC_POLL_MS);
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncNow("resume");
      }
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      appState.remove();
    };
  }, [runtime, mobileSession, captureSessions]);

  function currentApi(): CaptureApiClient | null {
    return apiClient(runtime, mobileSession);
  }

  async function bootstrap(): Promise<void> {
    setBusy(true);
    try {
      const nextRuntime = await fetchMobileRuntimeConfig();
      setRuntime(nextRuntime);
      let restored = await restoreLocalDevSession();
      if (restored && shouldReauthenticate(restored, isoNow(), 168)) {
        restored = null;
        await saveLocalDevSession(null);
      }
      if (!restored && !nextRuntime.authRequired) {
        const defaultProfile = LOCAL_DEV_PROFILES.find((profile) => profile.tenantUserId === DEFAULT_LOCAL_PROFILE_ID) ?? LOCAL_DEV_PROFILES[0];
        if (!defaultProfile) {
          throw new Error("No local mobile staff profiles are configured.");
        }
        restored = createLocalDevSession({
          tenantId: nextRuntime.tenantId,
          tenantUserId: defaultProfile.tenantUserId,
          role: defaultProfile.role,
          email: defaultProfile.email,
          label: defaultProfile.label
        });
        await saveLocalDevSession(restored);
      }
      if (!restored && nextRuntime.authRequired) {
        const token = await currentMobileIdToken(nextRuntime);
        if (!token) {
          setAuthMode("sign_in");
          const cachedBoard = await loadCachedBoard();
          if (cachedBoard) {
            setDayBoard(cachedBoard);
          }
          setCaptureSessions(await CAPTURE_STORE.list());
          return;
        }
        restored = {
          mode: "firebase",
          tenantId: nextRuntime.tenantId,
          tenantUserId: "",
          role: "TECHNICIAN",
          userId: "firebase-user",
          label: "Field session",
          idToken: token,
          lastAuthenticatedAt: isoNow()
        };
      }
      const bootSession = restored;
      const api = apiClient(nextRuntime, bootSession);
      const bootstrapBody = api ? await api.getSession(nextRuntime.tenantId) : null;
      if (!bootstrapBody || !bootSession) {
        setAuthMode("sign_in");
        return;
      }
      const profileLabel = bootstrapBody.localProfiles.find((profile) => profile.tenantUserId === bootstrapBody.access.tenantUserId)?.label;
      const hydratedSession = mobileSessionFromAccess({
        mode: bootSession.mode,
        access: bootstrapBody.access,
        userId: bootSession.userId || bootstrapBody.access.tenantUserId,
        label: profileLabel ?? bootSession.label,
        idToken: bootSession.idToken ?? null
      });
      setMobileSession(hydratedSession);
      setSessionBootstrap(bootstrapBody);
      if (hydratedSession.mode === "local_dev") {
        await saveLocalDevSession(hydratedSession);
      }
      setSelectedDevProfileId(selectedProfileId(hydratedSession));
      await loadBoard(nextRuntime, hydratedSession, true);
      setCaptureSessions(await CAPTURE_STORE.list());
      setAuthMode("ready");
    } catch (error) {
      const cachedBoard = await loadCachedBoard();
      if (cachedBoard) {
        setDayBoard(cachedBoard);
      }
      setCaptureSessions(await CAPTURE_STORE.list());
      setStatusMessage(error instanceof Error ? error.message : "Mobile bootstrap failed.");
      setAuthMode(runtime?.authRequired ? "sign_in" : "ready");
    } finally {
      setBusy(false);
    }
  }

  async function loadBoard(targetRuntime = runtime, targetSession = mobileSession, allowCache = true): Promise<void> {
    const api = apiClient(targetRuntime, targetSession);
    if (!api || !targetRuntime || !targetSession) {
      return;
    }
    const date = todayDateString();
    try {
      const board = await api.getDayBoard({
        tenantId: targetRuntime.tenantId,
        date,
        ...(targetSession.role === "TECHNICIAN" ? { technicianId: targetSession.tenantUserId } : {})
      });
      setDayBoard(board);
      await saveCachedBoard(board);
    } catch (error) {
      if (!allowCache) {
        throw error;
      }
      const cached = await loadCachedBoard();
      if (cached) {
        setDayBoard(cached);
      } else {
        throw error;
      }
    }
  }

  async function ensureVisitContext(visitId: string): Promise<MobileVisitContext | null> {
    if (visitContexts[visitId]) {
      return visitContexts[visitId];
    }
    const api = currentApi();
    if (!api || !runtime) {
      return null;
    }
    const context = await api.getVisitContext({ tenantId: runtime.tenantId, visitId });
    setVisitContexts((current) => ({ ...current, [visitId]: context }));
    return context;
  }

  async function persistAndHydrate(next: CaptureSessionDraft): Promise<CaptureSessionDraft> {
    const parsed = captureSessionDraftSchema.parse({
      ...next,
      syncStatus: deriveSessionSyncStatus(next),
      updatedAt: isoNow()
    });
    await CAPTURE_STORE.save(parsed);
    setCaptureSessions(await CAPTURE_STORE.list());
    return parsed;
  }



  async function switchLocalProfile(profileId: string): Promise<void> {
    if (!runtime) {
      return;
    }
    const profile = LOCAL_DEV_PROFILES.find((item) => item.tenantUserId === profileId || item.label === profileId);
    if (!profile) {
      return;
    }
    const nextSession = createLocalDevSession({
      tenantId: runtime.tenantId,
      tenantUserId: profile.tenantUserId,
      role: profile.role,
      email: profile.email,
      label: profile.label
    });
    await saveLocalDevSession(nextSession);
    setMobileSession(nextSession);
    setSelectedDevProfileId(profile.tenantUserId);
    const api = apiClient(runtime, nextSession);
    if (api) {
      const bootstrapBody = await api.getSession(runtime.tenantId);
      setSessionBootstrap(bootstrapBody);
    }
    await loadBoard(runtime, nextSession, true);
  }

  async function signIn(): Promise<void> {
    if (!runtime) {
      return;
    }
    setBusy(true);
    try {
      const idToken = await signInMobileFirebase(runtime, email, password);
      const provisional: MobileSession = {
        mode: "firebase",
        tenantId: runtime.tenantId,
        tenantUserId: "",
        role: "TECHNICIAN",
        userId: email.trim().toLowerCase(),
        label: email.trim(),
        idToken,
        email: email.trim(),
        lastAuthenticatedAt: isoNow()
      };
      const api = apiClient(runtime, provisional);
      if (!api) {
        throw new Error("Mobile session could not start.");
      }
      const bootstrapBody = await api.getSession(runtime.tenantId);
      const nextSession = mobileSessionFromAccess({
        mode: "firebase",
        access: bootstrapBody.access,
        userId: bootstrapBody.access.tenantUserId,
        label: bootstrapBody.access.email ?? email.trim(),
        idToken
      });
      await saveLocalDevSession(nextSession);
      setMobileSession(nextSession);
      setSessionBootstrap(bootstrapBody);
      setAuthMode("ready");
      await loadBoard(runtime, nextSession, true);
      setCaptureSessions(await CAPTURE_STORE.list());
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function signOut(): Promise<void> {
    if (runtime && mobileSession?.mode === "firebase") {
      await signOutMobileFirebase(runtime);
    }
    await saveLocalDevSession(null);
    setMobileSession(null);
    setSessionBootstrap(null);
    setAuthMode(runtime?.authRequired ? "sign_in" : "ready");
    setStatusMessage("Signed out.");
  }

  async function startFreshCapture(): Promise<void> {
    if (!runtime || !mobileSession) {
      return;
    }
    const suggestion = await maybeSuggestedMatch(dayBoard, await currentGps());
    const next = emptySession({
      tenantId: runtime.tenantId,
      actorTenantUserId: mobileSession.tenantUserId,
      suggestion: suggestion ?? undefined
    });
    const persisted = await persistAndHydrate(next);
    setActiveSessionId(persisted.id);
    setRouteStep(null);
    setEditingPhotoId(null);
    setChecklistId(null);
    setTypedVisitNarration("");
    setTypedPhotoNarration("");
  }

  async function startCaptureForVisit(visit: MobileDayBoardVisit): Promise<void> {
    if (!runtime || !mobileSession) {
      return;
    }
    const context = await ensureVisitContext(visit.id);
    const next = emptySession({
      tenantId: runtime.tenantId,
      actorTenantUserId: mobileSession.tenantUserId,
      visit,
      checklists: context ? checklistDraftsFromContext(context) : [],
      assignment: existingAssignmentFromVisit(visit),
      routeState: "return_to_camera"
    });
    const persisted = await persistAndHydrate(next);
    setActiveSessionId(persisted.id);
    setChecklistId(context?.checklists[0]?.id ?? null);
  }

  async function reopenSession(sessionId: string): Promise<void> {
    setActiveSessionId(sessionId);
    const session = captureSessions.find((item) => item.id === sessionId) ?? null;
    if (session?.visit?.id) {
      await ensureVisitContext(session.visit.id);
      setChecklistId(session.checklists[0]?.remoteChecklistId ?? null);
    }
  }

  async function capturePhoto(): Promise<void> {
    if (!activeSession || !cameraRef.current) {
      return;
    }
    const permission = capturePermission?.granted ? capturePermission : await requestCapturePermission();
    if (!permission?.granted) {
      Alert.alert("Camera needed", "Turn on camera access to keep capturing in the field.");
      return;
    }
    try {
      const shot = await cameraRef.current.takePictureAsync({ quality: 0.7, exif: true });
      const uri = await persistLocalFile(shot.uri, `capture_${Date.now()}.jpg`);
      const gps = await currentGps();
      const nextPhoto = capturePhotoDraftSchema.parse({
        id: `photo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        localFileUri: uri,
        previewUri: uri,
        fileName: uri.split("/").pop() ?? `capture_${Date.now()}.jpg`,
        mimeType: "image/jpeg",
        capturedAt: isoNow(),
        ...(gps ? { gps } : {}),
        ...(nextPairingRole ? { pairingRole: nextPairingRole } : {}),
        ...(nextPairingRole === "after" && nextOverlayCandidateId ? { pairWithMediaId: nextOverlayCandidateId } : {}),
        ...(nextPairingRole === "after" && overlayUri ? { pairOverlayUri: overlayUri } : {}),
        annotations: [],
        narrations: [],
        syncStatus: "queued"
      });
      const persisted = await persistAndHydrate({
        ...activeSession,
        photos: [...activeSession.photos, nextPhoto]
      });
      setEditingPhotoId(nextPhoto.id);
      setActiveSessionId(persisted.id);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Camera capture failed.");
    }
  }

  async function addTypedVisitNote(): Promise<void> {
    if (!activeSession || !typedVisitNarration.trim()) {
      return;
    }
    const nextNote = captureNarrationDraftSchema.parse({
      id: `narration_${Date.now().toString(36)}`,
      source: "typed",
      text: typedVisitNarration.trim(),
      createdAt: isoNow(),
      transcriptionStatus: "ready"
    });
    await persistAndHydrate({
      ...activeSession,
      visitNarrations: [...activeSession.visitNarrations, nextNote]
    });
    setTypedVisitNarration("");
  }

  async function addTypedPhotoNote(): Promise<void> {
    if (!activeSession || !editingPhoto || !typedPhotoNarration.trim()) {
      return;
    }
    const nextNote = captureNarrationDraftSchema.parse({
      id: `narration_${Date.now().toString(36)}`,
      source: "typed",
      text: typedPhotoNarration.trim(),
      createdAt: isoNow(),
      transcriptionStatus: "ready"
    });
    await persistAndHydrate({
      ...activeSession,
      photos: activeSession.photos.map((photo) => photo.id === editingPhoto.id ? { ...photo, narrations: [...photo.narrations, nextNote] } : photo)
    });
    setTypedPhotoNarration("");
  }

  async function startVoiceNote(target: VoiceTarget): Promise<void> {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Microphone needed", "Turn on microphone access to record field narration.");
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true
      });
      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await nextRecording.startAsync();
      setVoiceTarget(target);
      setRecording(nextRecording);
      setStatusMessage(target.kind === "photo" ? "Recording photo note…" : "Recording visit note…");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Voice recording could not start.");
    }
  }

  async function stopVoiceNote(): Promise<void> {
    if (!recording || !activeSession || !voiceTarget) {
      return;
    }
    try {
      await recording.stopAndUnloadAsync();
      const status = await recording.getStatusAsync();
      const sourceUri = recording.getURI();
      if (!sourceUri) {
        throw new Error("Voice note stopped but did not return a file.");
      }
      const uri = await persistLocalFile(sourceUri, `voice_${Date.now()}.m4a`);
      const nextNote = captureNarrationDraftSchema.parse({
        id: `narration_${Date.now().toString(36)}`,
        source: "voice",
        text: "",
        createdAt: isoNow(),
        audioFileUri: uri,
        audioMimeType: "audio/m4a",
        transcriptionStatus: "pending_sync"
      });
      if (voiceTarget.kind === "visit") {
        await persistAndHydrate({
          ...activeSession,
          visitNarrations: [...activeSession.visitNarrations, nextNote]
        });
      } else {
        await persistAndHydrate({
          ...activeSession,
          photos: activeSession.photos.map((photo) => photo.id === voiceTarget.photoId ? { ...photo, narrations: [...photo.narrations, nextNote] } : photo)
        });
      }
      setStatusMessage(`Voice note saved${typeof status.durationMillis === "number" ? ` (${Math.round(status.durationMillis / 1000)}s)` : ""}.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Voice recording could not finish.");
    } finally {
      setRecording(null);
      setVoiceTarget(null);
    }
  }

  async function savePhotoMarkup(points: CaptureAnnotation["points"]): Promise<void> {
    if (!activeSession || !editingPhoto) {
      return;
    }
    const annotation: CaptureAnnotation = {
      id: `annotation_${Date.now().toString(36)}`,
      kind: "path",
      color: "#14b8a6",
      createdAt: isoNow(),
      points
    };
    await persistAndHydrate({
      ...activeSession,
      photos: activeSession.photos.map((photo) => photo.id === editingPhoto.id ? { ...photo, annotations: [...photo.annotations, annotation] } : photo)
    });
  }

  async function updatePhoto(photoId: string, updater: (photo: CapturePhotoDraft) => CapturePhotoDraft): Promise<void> {
    if (!activeSession) {
      return;
    }
    await persistAndHydrate({
      ...activeSession,
      photos: activeSession.photos.map((photo) => photo.id === photoId ? updater(photo) : photo)
    });
  }

  async function chooseExistingRoute(visit: MobileDayBoardVisit): Promise<void> {
    if (!activeSession) {
      return;
    }
    const context = await ensureVisitContext(visit.id);
    await persistAndHydrate({
      ...activeSession,
      visit,
      routeState: "return_to_camera",
      suggestionAccepted: true,
      assignment: existingAssignmentFromVisit(visit),
      checklists: context ? checklistDraftsFromContext(context) : activeSession.checklists
    });
    setChecklistId(context?.checklists[0]?.id ?? null);
    setRouteStep(null);
  }

  async function saveNewClientRoute(): Promise<void> {
    if (!activeSession) {
      return;
    }
    await persistAndHydrate({
      ...activeSession,
      routeState: "return_to_camera",
      assignment: {
        mode: "request",
        requestDraft
      }
    });
    setRouteStep(null);
    setRequestDraft(defaultRequestDraft());
    setStatusMessage("New-client intake saved. Keep capturing on this same batch.");
  }

  async function chooseDecideLaterRoute(): Promise<void> {
    if (!activeSession) {
      return;
    }
    await persistAndHydrate({
      ...activeSession,
      assignment: {
        mode: "decide_later"
      },
      syncStatus: sessionHasQueuedWork(activeSession) ? "queued" : deriveSessionSyncStatus(activeSession)
    });
    setRouteStep(null);
    setActiveSessionId(null);
    await syncNow("decide-later");
  }

  async function doneWithCapture(): Promise<void> {
    if (!activeSession) {
      return;
    }
    if (activeSession.routeState === "fresh" && !activeSession.assignment) {
      setRouteStep("chooser");
      setRequestDraft(makeRequestDraftFromSuggestion(activeSession));
      return;
    }
    await persistAndHydrate({
      ...activeSession,
      syncStatus: sessionHasQueuedWork(activeSession) ? "queued" : deriveSessionSyncStatus(activeSession)
    });
    setActiveSessionId(null);
    setEditingPhotoId(null);
    await syncNow("done");
  }

  async function attachLatestPhotoToField(fieldId: string): Promise<void> {
    if (!activeSession || !checklistId) {
      return;
    }
    const latestPhoto = [...activeSession.photos].reverse().find(Boolean);
    if (!latestPhoto) {
      Alert.alert("No photo yet", "Capture a photo first, then attach it to this checklist field.");
      return;
    }
    const targetChecklist = activeSession.checklists.find((checklist) => checklist.remoteChecklistId === checklistId || checklist.id === checklistId);
    if (!targetChecklist) {
      return;
    }
    const currentUpdate = targetChecklist.updates.find((update) => update.fieldId === fieldId);
    const nextUpdate: CaptureChecklistFieldUpdate = {
      ...(currentUpdate ?? { fieldId }),
      localPhotoIds: [...new Set([...(currentUpdate?.localPhotoIds ?? []), latestPhoto.id])]
    };
    await persistAndHydrate({
      ...activeSession,
      checklists: activeSession.checklists.map((checklist) => checklist.id === targetChecklist.id ? {
        ...checklist,
        updates: [...checklist.updates.filter((update) => update.fieldId !== fieldId), nextUpdate],
        syncStatus: "queued",
        updatedAt: isoNow()
      } : checklist)
    });
  }

  async function updateChecklistField(fieldId: string, patch: Partial<CaptureChecklistFieldUpdate>): Promise<void> {
    if (!activeSession || !checklistId) {
      return;
    }
    const targetChecklist = activeSession.checklists.find((checklist) => checklist.remoteChecklistId === checklistId || checklist.id === checklistId);
    if (!targetChecklist) {
      return;
    }
    const currentUpdate = targetChecklist.updates.find((update) => update.fieldId === fieldId);
    const nextUpdate: CaptureChecklistFieldUpdate = {
      fieldId,
      ...(currentUpdate ?? {}),
      ...patch
    };
    await persistAndHydrate({
      ...activeSession,
      checklists: activeSession.checklists.map((checklist) => checklist.id === targetChecklist.id ? {
        ...checklist,
        updates: [...checklist.updates.filter((update) => update.fieldId !== fieldId), nextUpdate],
        syncStatus: "queued",
        updatedAt: isoNow()
      } : checklist)
    });
  }

  async function completeChecklistDraft(): Promise<void> {
    if (!activeSession || !checklistId) {
      return;
    }
    const targetChecklist = activeSession.checklists.find((checklist) => checklist.remoteChecklistId === checklistId || checklist.id === checklistId);
    if (!targetChecklist) {
      return;
    }
    const errors = checklistCompletionErrors(activeVisitContext, checklistId, targetChecklist);
    if (errors.length) {
      Alert.alert("Checklist needs a little more", errors.join("\n"));
      return;
    }
    await persistAndHydrate({
      ...activeSession,
      checklists: activeSession.checklists.map((checklist) => checklist.id === targetChecklist.id ? {
        ...checklist,
        complete: true,
        syncStatus: "queued",
        updatedAt: isoNow()
      } : checklist)
    });
    setStatusMessage("Checklist queued. It will finish on sync using the same fielddocs model as web.");
  }

  async function syncNow(reason: string): Promise<void> {
    const api = currentApi();
    if (!api || !runtime || !mobileSession) {
      return;
    }
    try {
      const sessions = await syncQueuedSessions(CAPTURE_STORE, {
        api,
        readFileAsBase64,
        now: isoNow
      });
      setCaptureSessions(sessions);
      if (sessions.some((session) => session.syncStatus === "failed")) {
        setStatusMessage(`Sync hit a snag (${reason}). Failed items stayed visible for retry.`);
      } else if (sessions.some((session) => session.syncStatus === "synced")) {
        setStatusMessage(`Synced ${queueSummary(sessions).synced} capture batch${queueSummary(sessions).synced === 1 ? "" : "es"} (${reason}).`);
      }
      if (dayBoard) {
        await loadBoard(runtime, mobileSession, true);
      }
      if (activeSession?.visit?.id) {
        const refreshed = await ensureVisitContext(activeSession.visit.id);
        if (refreshed) {
          setVisitContexts((current) => ({ ...current, [activeSession.visit!.id]: refreshed }));
        }
      }
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Mobile sync failed.");
    }
  }

  if (authMode === "booting" || busy && !dayBoard && !mobileSession) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centered}>
          <ActivityIndicator color="#14b8a6" size="large" />
          <Text style={styles.bootTitle}>Loading field capture</Text>
          <Text style={styles.bootBody}>Pulling today's work, local queue state, and capture context.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (authMode === "sign_in") {
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.signInShell}>
          <Text style={styles.brandEyebrow}>NexOps mobile capture</Text>
          <Text style={styles.screenTitle}>Field sign-in</Text>
          <Text style={styles.mutedCopy}>Use the same staff sign-in that already works on web. Sessions stay signed in unless they age out after seven days.</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="staff email" placeholderTextColor="#64748b" />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="password" placeholderTextColor="#64748b" />
          <Pressable style={styles.primaryButton} onPress={() => void signIn()}>
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </Pressable>
          {!!statusMessage && <Text style={styles.statusNote}>{statusMessage}</Text>}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brandEyebrow}>{sessionBootstrap?.branding.displayName ?? "Tenant workspace"}</Text>
          <Text style={styles.screenTitle}>{activeSession ? "Capture session" : "Field board"}</Text>
          <Text style={styles.mutedCopy}>{mobileSession?.label ?? "Field user"} · {roleSummary(mobileSession)} · {networkOnline ? "online" : "offline"}</Text>
        </View>
        <Pressable style={styles.secondaryButton} onPress={() => void signOut()}>
          <Text style={styles.secondaryButtonText}>Sign out</Text>
        </Pressable>
      </View>

      {!activeSession ? (
        <ScrollView contentContainerStyle={styles.boardShell}>
          {!!statusMessage && <Text style={styles.statusNote}>{statusMessage}</Text>}

          {mobileSession?.mode === "local_dev" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Local field profile</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.inlineActions}>
                {(sessionBootstrap?.localProfiles ?? LOCAL_DEV_PROFILES).map((profile) => {
                  const profileId = toProfileId(profile);
                  const selected = selectedDevProfileId === profileId;
                  return (
                    <Pressable key={profileId} style={[styles.inlinePill, selected && styles.inlinePillActive]} onPress={() => void switchLocalProfile(profileId)}>
                      <Text style={[styles.inlinePillText, selected && styles.inlinePillTextActive]}>{profile.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Queue status</Text>
            <Text style={styles.metricLine}>{queue.pending} pending · {queue.syncing} syncing · {queue.failed} failed · {queue.synced} synced</Text>
            <View style={styles.inlineActions}>
              <Pressable style={styles.primaryButtonCompact} onPress={() => void startFreshCapture()}>
                <Text style={styles.primaryButtonText}>New capture</Text>
              </Pressable>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => void loadBoard(runtime, mobileSession, true)}>
                <Text style={styles.secondaryButtonText}>Refresh day</Text>
              </Pressable>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => void syncNow("manual")}>
                <Text style={styles.secondaryButtonText}>Sync now</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Today's assigned visits</Text>
            {(dayBoard?.visits.length ?? 0) === 0 ? (
              <Text style={styles.mutedCopy}>No assigned visits are cached right now. Capture can still run unassigned and route later.</Text>
            ) : (
              dayBoard?.visits.map((visit) => (
                <View key={visit.id} style={styles.visitCard}>
                  <Text style={styles.visitTitle}>{visit.clientName ?? visit.title}</Text>
                  <Text style={styles.visitMeta}>{visit.serviceAddress.line1} · {formatWindow(visit.start, visit.end)}</Text>
                  <Text style={styles.visitMeta}>{visit.notes.gateCode ? `Gate ${visit.notes.gateCode}` : "No gate code"} · {visit.notes.poolType ?? "Pool type not tagged"}</Text>
                  <View style={styles.inlineActions}>
                    <Pressable style={styles.primaryButtonCompact} onPress={() => void startCaptureForVisit(visit)}>
                      <Text style={styles.primaryButtonText}>Capture</Text>
                    </Pressable>
                    <Pressable style={styles.secondaryButtonCompact} onPress={async () => {
                      await ensureVisitContext(visit.id);
                      const draftSession = emptySession({
                        tenantId: runtime?.tenantId ?? mobileSession?.tenantId ?? "",
                        actorTenantUserId: mobileSession?.tenantUserId ?? "local-technician",
                        visit,
                        assignment: existingAssignmentFromVisit(visit),
                        checklists: visitContexts[visit.id] ? checklistDraftsFromContext(visitContexts[visit.id]!) : [],
                        routeState: "return_to_camera"
                      });
                      await persistAndHydrate(draftSession);
                      setActiveSessionId(draftSession.id);
                      setChecklistId((visitContexts[visit.id]?.checklists[0]?.id) ?? null);
                    }}>
                      <Text style={styles.secondaryButtonText}>Checklist</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Queued and recent sessions</Text>
            {captureSessions.length === 0 ? (
              <Text style={styles.mutedCopy}>Nothing is parked locally yet.</Text>
            ) : (
              captureSessions.map((session) => (
                <Pressable key={session.id} style={styles.sessionRow} onPress={() => void reopenSession(session.id)}>
                  <View style={styles.sessionRowCopy}>
                    <Text style={styles.sessionTitle}>{sessionHeadline(session)}</Text>
                    <Text style={styles.visitMeta}>{session.photos.length} photos · {deriveSessionSyncStatus(session)}{session.lastError ? ` · ${session.lastError}` : ""}</Text>
                  </View>
                  <Text style={[styles.sessionBadge, session.syncStatus === "failed" && styles.sessionBadgeFailed]}>{deriveSessionSyncStatus(session)}</Text>
                </Pressable>
              ))
            )}
          </View>
        </ScrollView>
      ) : (
        <View style={styles.captureShell}>
          <View style={styles.captureHeader}>
            <View style={styles.captureHeaderCopy}>
              <Text style={styles.cardTitle}>{sessionHeadline(activeSession)}</Text>
              <Text style={styles.visitMeta}>{activeSession.visit?.serviceAddress.line1 ?? "Route it when you're done"} · {activeSession.photos.length} shots</Text>
              {!!activeSession.suggestion && !activeSession.assignment && (
                <Text style={styles.suggestionBanner}>
                  You appear to be near {activeSession.suggestion.propertyName ?? activeSession.suggestion.clientName ?? activeSession.suggestion.serviceAddress.line1}. Accept it on Done or route another way.
                </Text>
              )}
            </View>
            <Pressable style={styles.secondaryButtonCompact} onPress={() => {
              setActiveSessionId(null);
              setEditingPhotoId(null);
              setChecklistId(null);
            }}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
          </View>

          <View style={styles.cameraWrap}>
            {!capturePermission?.granted && (
              <View style={styles.permissionCard}>
                <Text style={styles.cardTitle}>Camera access needed</Text>
                <Text style={styles.mutedCopy}>Turn on the camera so field photos can stay local even with no signal.</Text>
                <Pressable style={styles.primaryButtonCompact} onPress={() => void requestCapturePermission()}>
                  <Text style={styles.primaryButtonText}>Allow camera</Text>
                </Pressable>
              </View>
            )}
            {capturePermission?.granted && (
              <>
                <CameraView ref={cameraRef} style={styles.cameraView} facing="back" onCameraReady={() => setCameraReady(true)} />
                {overlayUri && (
                  <Image source={{ uri: overlayUri }} style={styles.overlayImage} />
                )}
                <View style={styles.cameraOverlayTop}>
                  <Pressable style={[styles.inlinePill, nextPairingRole === null && styles.inlinePillActive]} onPress={() => { setNextPairingRole(null); setNextOverlayCandidateId(null); }}>
                    <Text style={[styles.inlinePillText, nextPairingRole === null && styles.inlinePillTextActive]}>Standard</Text>
                  </Pressable>
                  <Pressable style={[styles.inlinePill, nextPairingRole === "before" && styles.inlinePillActive]} onPress={() => { setNextPairingRole("before"); setNextOverlayCandidateId(null); }}>
                    <Text style={[styles.inlinePillText, nextPairingRole === "before" && styles.inlinePillTextActive]}>Before</Text>
                  </Pressable>
                  <Pressable style={[styles.inlinePill, nextPairingRole === "after" && styles.inlinePillActive]} onPress={() => setNextPairingRole("after")}>
                    <Text style={[styles.inlinePillText, nextPairingRole === "after" && styles.inlinePillTextActive]}>After overlay</Text>
                  </Pressable>
                </View>
                {nextPairingRole === "after" && !!activeVisitContext && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.overlayPicker}>
                    {activeVisitContext.beforeAfterCandidates.map((candidate) => {
                      const selected = nextOverlayCandidateId === candidate.id;
                      return (
                        <Pressable key={candidate.id} style={[styles.inlinePill, selected && styles.inlinePillActive]} onPress={() => setNextOverlayCandidateId(candidate.id)}>
                          <Text style={[styles.inlinePillText, selected && styles.inlinePillTextActive]}>{candidate.tags.includes("before") ? "Before" : "Photo"} · {candidate.aiCaption || "Existing"}</Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
                <View style={styles.cameraActions}>
                  <Pressable style={styles.primaryCaptureButton} onPress={() => void capturePhoto()} disabled={!cameraReady}>
                    <Text style={styles.primaryButtonText}>Capture</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButtonCompact} onPress={() => void doneWithCapture()}>
                    <Text style={styles.secondaryButtonText}>Done</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButtonCompact} onPress={() => setChecklistId(activeVisitContext?.checklists[0]?.id ?? activeSession.checklists[0]?.remoteChecklistId ?? null)}>
                    <Text style={styles.secondaryButtonText}>Checklist</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>

          <View style={styles.captureFooter}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstrip}>
              {activeSession.photos.map((photo) => (
                <Pressable key={photo.id} style={[styles.thumbCard, editingPhotoId === photo.id && styles.thumbCardActive]} onPress={() => setEditingPhotoId(photo.id)}>
                  <Image source={{ uri: photo.previewUri }} style={styles.thumbImage} />
                  <Text style={styles.thumbMeta}>{photo.pairingRole ?? "shot"}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.visitNotesCard}>
              <Text style={styles.cardTitle}>Visit narration</Text>
              <TextInput value={typedVisitNarration} onChangeText={setTypedVisitNarration} multiline style={styles.multilineInput} placeholder="Type a field note that should land in the report..." placeholderTextColor="#64748b" />
              <View style={styles.inlineActions}>
                <Pressable style={styles.primaryButtonCompact} onPress={() => void addTypedVisitNote()}>
                  <Text style={styles.primaryButtonText}>Add text note</Text>
                </Pressable>
                <Pressable style={styles.secondaryButtonCompact} onPress={() => void (recording && voiceTarget?.kind === "visit" ? stopVoiceNote() : startVoiceNote({ kind: "visit" }))}>
                  <Text style={styles.secondaryButtonText}>{recording && voiceTarget?.kind === "visit" ? "Stop voice" : "Voice note"}</Text>
                </Pressable>
              </View>
              {activeSession.visitNarrations.map((note) => (
                <Text key={note.id} style={styles.visitMeta}>{note.source === "voice" ? "Voice" : "Text"} · {note.text || "Queued for transcription"}</Text>
              ))}
            </View>
          </View>
        </View>
      )}

      <Modal visible={Boolean(editingPhoto)} animationType="slide" onRequestClose={() => setEditingPhotoId(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalShell}>
            <View style={styles.header}>
              <View>
                <Text style={styles.cardTitle}>Photo editor</Text>
                <Text style={styles.mutedCopy}>Markup, before/after role, and narration all stay on the same media record.</Text>
              </View>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => setEditingPhotoId(null)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            {editingPhoto && (
              <>
                <View style={styles.annotationWrap}>
                  <Image source={{ uri: editingPhoto.previewUri }} style={styles.annotationImage} />
                  <AnnotationCanvas photo={editingPhoto} onCommit={(points) => void savePhotoMarkup(points)} />
                </View>
                <TextInput
                  value={editingPhoto.caption}
                  onChangeText={(value) => void updatePhoto(editingPhoto.id, (photo) => ({ ...photo, caption: value }))}
                  style={styles.input}
                  placeholder="Short caption"
                  placeholderTextColor="#64748b"
                />
                <View style={styles.inlineActions}>
                  <Pressable style={[styles.inlinePill, editingPhoto.pairingRole === "before" && styles.inlinePillActive]} onPress={() => void updatePhoto(editingPhoto.id, (photo) => ({ ...photo, pairingRole: "before" }))}>
                    <Text style={[styles.inlinePillText, editingPhoto.pairingRole === "before" && styles.inlinePillTextActive]}>Before</Text>
                  </Pressable>
                  <Pressable style={[styles.inlinePill, editingPhoto.pairingRole === "after" && styles.inlinePillActive]} onPress={() => void updatePhoto(editingPhoto.id, (photo) => ({ ...photo, pairingRole: "after" }))}>
                    <Text style={[styles.inlinePillText, editingPhoto.pairingRole === "after" && styles.inlinePillTextActive]}>After</Text>
                  </Pressable>
                </View>
                <TextInput value={typedPhotoNarration} onChangeText={setTypedPhotoNarration} multiline style={styles.multilineInput} placeholder="Type a note for this photo..." placeholderTextColor="#64748b" />
                <View style={styles.inlineActions}>
                  <Pressable style={styles.primaryButtonCompact} onPress={() => void addTypedPhotoNote()}>
                    <Text style={styles.primaryButtonText}>Add text note</Text>
                  </Pressable>
                  <Pressable style={styles.secondaryButtonCompact} onPress={() => void (recording && voiceTarget?.kind === "photo" && voiceTarget.photoId === editingPhoto.id ? stopVoiceNote() : startVoiceNote({ kind: "photo", photoId: editingPhoto.id }))}>
                    <Text style={styles.secondaryButtonText}>{recording && voiceTarget?.kind === "photo" && voiceTarget.photoId === editingPhoto.id ? "Stop voice" : "Voice note"}</Text>
                  </Pressable>
                </View>
                {editingPhoto.narrations.map((note) => (
                  <Text key={note.id} style={styles.visitMeta}>{note.source === "voice" ? "Voice" : "Text"} · {note.text || "Queued for transcription"}</Text>
                ))}
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={Boolean(checklistId)} animationType="slide" onRequestClose={() => setChecklistId(null)}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalShell}>
            <View style={styles.header}>
              <View>
                <Text style={styles.cardTitle}>Field checklist</Text>
                <Text style={styles.mutedCopy}>Same checklist model as web, with photo-required fields enforced before completion.</Text>
              </View>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => setChecklistId(null)}>
                <Text style={styles.secondaryButtonText}>Close</Text>
              </Pressable>
            </View>
            {activeVisitContext?.checklists.find((checklist) => checklist.id === checklistId)?.fields.map((field) => {
              const merged = mergedChecklistField(activeVisitContext, checklistId!, field.fieldId, activeChecklistDraftValue);
              if (!merged) {
                return null;
              }
              return (
                <View key={field.fieldId} style={styles.fieldCard}>
                  <Text style={styles.fieldLabel}>{merged.label}</Text>
                  <Text style={styles.fieldMeta}>{merged.section} · {merged.type}{merged.photoRequired ? " · photo required" : ""}</Text>
                  {merged.type === "free_text" && (
                    <TextInput
                      value={merged.note ?? ""}
                      onChangeText={(value) => void updateChecklistField(field.fieldId, { note: value })}
                      multiline
                      style={styles.multilineInput}
                      placeholder="Add field detail"
                      placeholderTextColor="#64748b"
                    />
                  )}
                  {(merged.type === "measurement" || merged.type === "count") && (
                    <TextInput
                      value={merged.numberValue !== undefined ? String(merged.numberValue) : ""}
                      onChangeText={(value) => void updateChecklistField(field.fieldId, { numberValue: value ? Number(value) : undefined })}
                      keyboardType="decimal-pad"
                      style={styles.input}
                      placeholder={merged.unit ? `Value (${merged.unit})` : "Value"}
                      placeholderTextColor="#64748b"
                    />
                  )}
                  {merged.type === "pass_fail" && (
                    <View style={styles.inlineActions}>
                      {["pass", "fail", "not_applicable"].map((status) => (
                        <Pressable key={status} style={[styles.inlinePill, merged.status === status && styles.inlinePillActive]} onPress={() => void updateChecklistField(field.fieldId, { status: status as CaptureChecklistFieldUpdate["status"] })}>
                          <Text style={[styles.inlinePillText, merged.status === status && styles.inlinePillTextActive]}>{status.replace("_", " ")}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {merged.type === "multi_select" && (
                    <View style={styles.inlineActions}>
                      {(merged.options ?? []).map((option) => {
                        const selected = merged.multiValue?.includes(option) ?? false;
                        return (
                          <Pressable
                            key={option}
                            style={[styles.inlinePill, selected && styles.inlinePillActive]}
                            onPress={() => {
                              const current = new Set(merged.multiValue ?? []);
                              if (current.has(option)) current.delete(option); else current.add(option);
                              void updateChecklistField(field.fieldId, { multiValue: [...current] });
                            }}
                          >
                            <Text style={[styles.inlinePillText, selected && styles.inlinePillTextActive]}>{option}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                  {(merged.type === "photo_attachment" || merged.photoRequired) && (
                    <View style={styles.inlineActions}>
                      <Pressable style={styles.primaryButtonCompact} onPress={() => void attachLatestPhotoToField(field.fieldId)}>
                        <Text style={styles.primaryButtonText}>Attach latest photo</Text>
                      </Pressable>
                      <Text style={styles.visitMeta}>
                        {((merged.mediaIds?.length ?? 0) + (activeChecklistDraftValue?.updates.find((update) => update.fieldId === field.fieldId)?.localPhotoIds?.length ?? 0))} attached
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
            <View style={styles.inlineActions}>
              <Pressable style={styles.primaryButton} onPress={() => void completeChecklistDraft()}>
                <Text style={styles.primaryButtonText}>Complete checklist</Text>
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={routeStep === "chooser"} transparent animationType="fade" onRequestClose={() => setRouteStep(null)}>
        <View style={styles.overlayDim}>
          <View style={styles.routeCard}>
            <Text style={styles.cardTitle}>Route this capture</Text>
            <Text style={styles.mutedCopy}>Fresh sessions always stop here before the batch leaves the phone.</Text>
            <Pressable style={styles.primaryButtonCompact} onPress={() => setRouteStep("existing")}>
              <Text style={styles.primaryButtonText}>Existing client / visit</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonCompact} onPress={() => setRouteStep("request")}>
              <Text style={styles.secondaryButtonText}>New client request</Text>
            </Pressable>
            <Pressable style={styles.secondaryButtonCompact} onPress={() => void chooseDecideLaterRoute()}>
              <Text style={styles.secondaryButtonText}>Decide later</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={routeStep === "existing"} animationType="slide" onRequestClose={() => setRouteStep("chooser")}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalShell}>
            <View style={styles.header}>
              <View>
                <Text style={styles.cardTitle}>Pick the matching visit</Text>
                <Text style={styles.mutedCopy}>Today's assigned visits win first; nearby known properties are still visible for override.</Text>
              </View>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => setRouteStep("chooser")}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            </View>
            {dayBoard?.visits.map((visit) => (
              <Pressable key={visit.id} style={styles.visitCard} onPress={() => void chooseExistingRoute(visit)}>
                <Text style={styles.visitTitle}>{visit.clientName ?? visit.title}</Text>
                <Text style={styles.visitMeta}>{visit.serviceAddress.line1} · {formatWindow(visit.start, visit.end)}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={routeStep === "request"} animationType="slide" onRequestClose={() => setRouteStep("chooser")}>
        <SafeAreaView style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalShell}>
            <View style={styles.header}>
              <View>
                <Text style={styles.cardTitle}>New client intake</Text>
                <Text style={styles.mutedCopy}>Save the request draft, return to camera automatically, and let sync materialize the request later.</Text>
              </View>
              <Pressable style={styles.secondaryButtonCompact} onPress={() => setRouteStep("chooser")}>
                <Text style={styles.secondaryButtonText}>Back</Text>
              </Pressable>
            </View>
            <TextInput style={styles.input} value={requestDraft.clientName} onChangeText={(value) => setRequestDraft((current) => ({ ...current, clientName: value }))} placeholder="Client name" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={requestDraft.phone ?? ""} onChangeText={(value) => setRequestDraft((current) => ({ ...current, phone: value }))} placeholder="Telephone" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={requestDraft.email ?? ""} onChangeText={(value) => setRequestDraft((current) => ({ ...current, email: value }))} placeholder="Email (encouraged)" placeholderTextColor="#64748b" />
            <TextInput style={styles.input} value={requestDraft.propertyStreet1} onChangeText={(value) => setRequestDraft((current) => ({ ...current, propertyStreet1: value }))} placeholder="Street address" placeholderTextColor="#64748b" />
            <View style={styles.inlineInputs}>
              <TextInput style={[styles.input, styles.inlineInput]} value={requestDraft.propertyCity} onChangeText={(value) => setRequestDraft((current) => ({ ...current, propertyCity: value }))} placeholder="City" placeholderTextColor="#64748b" />
              <TextInput style={[styles.input, styles.inlineInput]} value={requestDraft.propertyProvince} onChangeText={(value) => setRequestDraft((current) => ({ ...current, propertyProvince: value }))} placeholder="State" placeholderTextColor="#64748b" />
              <TextInput style={[styles.input, styles.inlineInput]} value={requestDraft.propertyPostalCode} onChangeText={(value) => setRequestDraft((current) => ({ ...current, propertyPostalCode: value }))} placeholder="ZIP" placeholderTextColor="#64748b" />
            </View>
            <TextInput style={styles.multilineInput} value={requestDraft.issueSummary} onChangeText={(value) => setRequestDraft((current) => ({ ...current, issueSummary: value }))} placeholder="Issue summary" placeholderTextColor="#64748b" multiline />
            <View style={styles.inlineInputs}>
              <TextInput style={[styles.input, styles.inlineInput]} value={requestDraft.gateCode ?? ""} onChangeText={(value) => setRequestDraft((current) => ({ ...current, gateCode: value }))} placeholder="Gate code" placeholderTextColor="#64748b" />
              <TextInput style={[styles.input, styles.inlineInput]} value={requestDraft.poolType ?? ""} onChangeText={(value) => setRequestDraft((current) => ({ ...current, poolType: value }))} placeholder="Pool type" placeholderTextColor="#64748b" />
            </View>
            <View style={styles.toggleRow}>
              <Text style={styles.fieldLabel}>Pet on site</Text>
              <Pressable style={[styles.inlinePill, requestDraft.petPresent && styles.inlinePillActive]} onPress={() => setRequestDraft((current) => ({ ...current, petPresent: !current.petPresent }))}>
                <Text style={[styles.inlinePillText, requestDraft.petPresent && styles.inlinePillTextActive]}>{requestDraft.petPresent ? "Yes" : "No"}</Text>
              </Pressable>
            </View>
            {requestDraft.petPresent && (
              <TextInput style={styles.input} value={requestDraft.petName ?? ""} onChangeText={(value) => setRequestDraft((current) => ({ ...current, petName: value }))} placeholder="Pet name" placeholderTextColor="#64748b" />
            )}
            <Pressable style={styles.primaryButton} onPress={() => void saveNewClientRoute()}>
              <Text style={styles.primaryButtonText}>Save and return to camera</Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function apiClient(runtime: MobileRuntimeConfig | null, session: MobileSession | null): CaptureApiClient | null {
  if (!runtime) {
    return null;
  }
  return new CaptureApiClient({
    baseUrl: runtime.apiBaseUrl,
    tokenProvider: async () => {
      if (!session) {
        return null;
      }
      if (session.mode === "firebase") {
        return session.idToken ?? currentMobileIdToken(runtime);
      }
      return null;
    },
    localDevProfileProvider: async () => session?.mode === "local_dev" ? session.tenantUserId : null
  });
}

function AnnotationCanvas(input: {
  photo: CapturePhotoDraft;
  onCommit: (points: CaptureAnnotation["points"]) => void;
}): React.ReactElement {
  const [bounds, setBounds] = useState({ width: 1, height: 1 });
  const panResponder = useMemo(
    () => buildAnnotationPanResponder({
      disabled: false,
      bounds,
      onCommit: input.onCommit
    }),
    [bounds, input.onCommit]
  );
  return (
    <View style={styles.annotationOverlay} onLayout={(event) => setBounds({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })} {...panResponder.panHandlers}>
      {input.photo.annotations.flatMap((annotation) => annotation.points.map((point, index) => (
        <View
          key={`${annotation.id}_${index}`}
          style={[
            styles.annotationDot,
            {
              left: point.x * bounds.width - 4,
              top: point.y * bounds.height - 4,
              backgroundColor: annotation.color
            }
          ]}
        />
      )))}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: "#08131a"
  },
  modalSafe: {
    flex: 1,
    backgroundColor: "#f8fafc"
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28
  },
  signInShell: {
    padding: 24,
    gap: 14
  },
  header: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start"
  },
  brandEyebrow: {
    color: "#6ee7b7",
    textTransform: "uppercase",
    letterSpacing: 2,
    fontSize: 12,
    fontWeight: "700"
  },
  screenTitle: {
    color: "#f8fafc",
    fontSize: 30,
    fontWeight: "800"
  },
  bootTitle: {
    color: "#f8fafc",
    fontSize: 24,
    fontWeight: "800",
    marginTop: 16
  },
  bootBody: {
    color: "#cbd5e1",
    marginTop: 8,
    textAlign: "center"
  },
  mutedCopy: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20
  },
  statusNote: {
    color: "#c7f9ea",
    backgroundColor: "#0f766e",
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14
  },
  boardShell: {
    padding: 18,
    gap: 14
  },
  card: {
    backgroundColor: "#10202b",
    borderRadius: 20,
    padding: 16,
    gap: 10
  },
  cardTitle: {
    color: "#08131a",
    fontSize: 22,
    fontWeight: "800"
  },
  metricLine: {
    color: "#e2e8f0",
    fontSize: 15
  },
  inlineActions: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 8
  },
  inlineInput: {
    flex: 1
  },
  primaryButton: {
    backgroundColor: "#22c55e",
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 14,
    alignItems: "center"
  },
  primaryButtonCompact: {
    backgroundColor: "#22c55e",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  primaryCaptureButton: {
    backgroundColor: "#22c55e",
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 14,
    minWidth: 110,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#08131a",
    fontWeight: "800",
    fontSize: 16
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  secondaryButtonCompact: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  secondaryButtonText: {
    color: "#e2e8f0",
    fontWeight: "700"
  },
  inlinePill: {
    borderWidth: 1,
    borderColor: "#475569",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#10202b"
  },
  inlinePillActive: {
    backgroundColor: "#d1fae5",
    borderColor: "#14b8a6"
  },
  inlinePillText: {
    color: "#cbd5e1",
    fontWeight: "700"
  },
  inlinePillTextActive: {
    color: "#0f172a"
  },
  visitCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    gap: 6
  },
  visitTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800"
  },
  visitMeta: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 18
  },
  sessionRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  sessionRowCopy: {
    flex: 1,
    paddingRight: 12
  },
  sessionTitle: {
    color: "#f8fafc",
    fontWeight: "800",
    fontSize: 16
  },
  sessionBadge: {
    color: "#d1fae5",
    fontWeight: "800",
    textTransform: "uppercase",
    fontSize: 12
  },
  sessionBadgeFailed: {
    color: "#fca5a5"
  },
  captureShell: {
    flex: 1
  },
  captureHeader: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  captureHeaderCopy: {
    flex: 1
  },
  suggestionBanner: {
    color: "#fde68a",
    marginTop: 6,
    lineHeight: 18
  },
  cameraWrap: {
    flex: 1,
    marginHorizontal: 18,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#020617",
    position: "relative"
  },
  cameraView: {
    flex: 1,
    minHeight: 320
  },
  overlayImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.28
  },
  cameraOverlayTop: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap"
  },
  overlayPicker: {
    position: "absolute",
    top: 56,
    left: 12,
    right: 12,
    maxHeight: 44
  },
  cameraActions: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10
  },
  captureFooter: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12
  },
  filmstrip: {
    gap: 10,
    paddingBottom: 4
  },
  thumbCard: {
    width: 104,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#10202b"
  },
  thumbCardActive: {
    borderWidth: 2,
    borderColor: "#22c55e"
  },
  thumbImage: {
    width: "100%",
    height: 84
  },
  thumbMeta: {
    color: "#e2e8f0",
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    textTransform: "capitalize"
  },
  visitNotesCard: {
    backgroundColor: "#10202b",
    borderRadius: 18,
    padding: 14,
    gap: 10
  },
  permissionCard: {
    padding: 20,
    gap: 12
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16
  },
  multilineInput: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 96,
    textAlignVertical: "top",
    fontSize: 16
  },
  modalShell: {
    padding: 18,
    gap: 14
  },
  annotationWrap: {
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#0f172a",
    minHeight: 320
  },
  annotationImage: {
    width: "100%",
    aspectRatio: 3 / 4
  },
  annotationOverlay: {
    ...StyleSheet.absoluteFillObject
  },
  annotationDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4
  },
  fieldCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    padding: 14,
    gap: 10,
    backgroundColor: "#ffffff"
  },
  fieldLabel: {
    color: "#0f172a",
    fontWeight: "800",
    fontSize: 16
  },
  fieldMeta: {
    color: "#64748b",
    fontSize: 13
  },
  overlayDim: {
    flex: 1,
    backgroundColor: "rgba(2, 6, 23, 0.7)",
    justifyContent: "center",
    padding: 20
  },
  routeCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 24,
    padding: 18,
    gap: 12
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  }
});
