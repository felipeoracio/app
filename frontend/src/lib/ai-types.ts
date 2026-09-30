// Hand-written mirrors of backend/models/ai.py. Nothing infers across HTTP.
export interface AIProfile {
  id: string;
  user_id: string;
  writing_goal: string | null;
  writing_style: string | null;
  audience: string | null;
  primary_topics: string[];
  current_projects: string[];
  favorite_subjects: string[];
  avoid_topics: string[];
  personal_context: string | null;
  ai_preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AIProfileUpdate {
  writing_goal: string | null;
  writing_style: string | null;
  audience: string | null;
  primary_topics: string[];
  current_projects: string[];
  favorite_subjects: string[];
  avoid_topics: string[];
  personal_context: string | null;
  ai_preferences: Record<string, unknown>;
}

export interface AIOnboardingAnswer {
  id: string;
  user_id: string;
  question_id: string;
  question: string;
  answer: string;
  created_at: string;
  updated_at: string;
}

export interface AIOnboardingAnswerUpsert {
  question_id: string;
  question: string;
  answer: string;
}

export type DocumentType = "memoir" | "journal" | "book" | "research" | "outline" | "notes" | "personal_history" | "reference" | "other";
export type ProcessingStatus = "pending" | "processing" | "ready" | "failed";

export interface AIDocument {
  id: string;
  user_id: string;
  filename: string;
  file_type: string;
  storage_path: string;
  document_title: string;
  document_type: DocumentType;
  processing_status: ProcessingStatus;
  processing_error: string | null;
  summary: string | null;
  word_count: number;
  created_at: string;
  updated_at: string;
}

export interface AIDocumentUpload {
  filename: string;
  file_type: string;
  document_title: string;
  document_type: DocumentType;
}

export interface AIDocumentChunk {
  id: string;
  user_id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AIDocumentChunkCreate {
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  metadata: Record<string, unknown>;
}

export interface AIWritingSession {
  id: string;
  user_id: string;
  existing_session_ref: string | null;
  word_count: number;
  writing_duration_seconds: number;
  content: string | null;
  save_to_memory: boolean;
  created_at: string;
}

export interface AIWritingSessionCreate {
  existing_session_ref: string | null;
  word_count: number;
  writing_duration_seconds: number;
  content: string | null;
  save_to_memory: boolean;
}

export interface AIWritingChunk {
  id: string;
  user_id: string;
  writing_session_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  created_at: string;
}

export type MemoryType = "person" | "place" | "event" | "experience" | "interest" | "goal" | "project" | "theme" | "unfinished_idea" | "preference" | "writing_pattern";
export interface AIMemory {
  id: string;
  user_id: string;
  memory_type: MemoryType;
  memory: string;
  importance: number;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIMemoryCreate {
  memory_type: MemoryType;
  memory: string;
  importance: number;
  source_id: string | null;
}

export type SuggestionStatus = "shown" | "accepted" | "rejected" | "ignored" | "written";
export interface AISuggestion {
  id: string;
  user_id: string;
  title: string;
  suggestion: string;
  reason: string;
  context_summary: string;
  related_topics: string[];
  source_ids: string[];
  status: SuggestionStatus;
  created_at: string;
}

export interface AISuggestionRequest {
  current_writing: string | null;
  current_project: string | null;
}

export interface AISuggestionResult {
  title: string;
  suggestion: string;
  why: string;
  related_topics: string[];
}

export interface AISuggestionFeedbackCreate {
  suggestion_id: string;
  helpful: boolean;
  reason: "already_written" | "not_interested" | "wrong_direction" | "too_personal" | "too_vague" | "other" | null;
  note: string | null;
}

export interface AIFeedback {
  id: string;
  user_id: string;
  suggestion_id: string;
  helpful: boolean;
  reason: string | null;
  note: string | null;
  created_at: string;
}

export interface AIUsageEvent {
  id: string;
  user_id: string;
  date: string;
  request_type: string;
  input_tokens: number | null;
  output_tokens: number | null;
  estimated_cost: number | null;
  created_at: string;
}

export interface AIStatus {
  auth_configured: boolean;
  database: string;
  database_configured: boolean;
  provider: string;
  model: string;
  retrieval_ready: boolean;
  message: string;
}