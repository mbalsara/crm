export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestHeader {
  tenantId: string;
  userId: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
