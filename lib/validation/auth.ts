import { z } from "zod";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export const sendOtpSchema = z.object({
  phone: z.string().trim().min(6).max(25).transform((value, context) => {
    const parsed = parsePhoneNumberFromString(value, "BD");
    if (!parsed?.isValid()) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid phone number with country code." });
      return z.NEVER;
    }
    return parsed.number;
  }),
});

export const verifyOtpSchema = sendOtpSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit verification code."),
});
