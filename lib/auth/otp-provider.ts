import { getServerEnv } from "@/lib/env";

type TwilioResponse = { status?: string; message?: string };

async function twilioRequest(path: string, body: URLSearchParams): Promise<TwilioResponse> {
  const env = getServerEnv();
  const credentials = Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://verify.twilio.com/v2/Services/${env.TWILIO_VERIFY_SERVICE_SID}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as TwilioResponse;
  if (!response.ok) {
    throw new Error("OTP_PROVIDER_ERROR");
  }
  return payload;
}

export async function sendPhoneOtp(phone: string) {
  return twilioRequest("Verifications", new URLSearchParams({ To: phone, Channel: "sms" }));
}

export async function verifyPhoneOtp(phone: string, code: string) {
  const result = await twilioRequest("VerificationCheck", new URLSearchParams({ To: phone, Code: code }));
  return result.status === "approved";
}
