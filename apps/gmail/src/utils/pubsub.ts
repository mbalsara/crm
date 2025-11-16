/**
 * Verify Pub/Sub push authentication
 * https://cloud.google.com/pubsub/docs/push#setting_up_for_push_authentication
 */
export async function verifyPubSubToken(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) {
    return false;
  }

  // In production, you should verify the JWT token
  // For now, we'll do basic Bearer token check
  const expectedToken = process.env.PUBSUB_VERIFICATION_TOKEN;

  if (!expectedToken) {
    console.warn('PUBSUB_VERIFICATION_TOKEN not set, skipping verification');
    return true; // Allow in development
  }

  const token = authHeader.replace('Bearer ', '');
  return token === expectedToken;
}

/**
 * Decode Pub/Sub message data
 */
export function decodePubSubMessage(data: string): any {
  try {
    const decoded = Buffer.from(data, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch (error) {
    console.error('Failed to decode Pub/Sub message:', error);
    throw new Error('Invalid Pub/Sub message format');
  }
}
