// Hand-written mirrors of backend/models/auth.py.
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
  plan: string | null;
  ai_access: boolean;
}

export interface AuthResult {
  user: AuthUser;
  authenticated: boolean;
  message: string;
}