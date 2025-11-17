/**
 * Verify Pub/Sub push authentication
 * https://cloud.google.com/pubsub/docs/push#setting_up_for_push_authentication
 */
export async function verifyPubSubToken(authHeader: string | undefined): Promise<boolean> {
  // If no verification token is configured, allow requests
  // This is typical when using default Pub/Sub push without OIDC
  const expectedToken = process.env.PUBSUB_VERIFICATION_TOKEN;

  if (!expectedToken) {
    console.log('PUBSUB_VERIFICATION_TOKEN not set, allowing request (using default Pub/Sub authentication)');
    return true;
  }

  // If token is configured, verify it
  if (!authHeader) {
    return false;
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
