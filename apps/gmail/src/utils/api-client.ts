export class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.API_BASE_URL || 'http://localhost:4000';
  }
}
