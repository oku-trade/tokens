import { isAddress } from "viem";
import { z } from "zod";

const HttpsUrl = z.string().refine(
  (url) => {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === "https:";
    } catch {
      return false;
    }
  },
  { message: "Invalid HTTPS URL" },
);

const ChecksummedAddress = z.string().refine(
  (address) => {
    try {
      return isAddress(address, { strict: true });
    } catch {
      return false;
    }
  },
  { message: "Invalid checksummed Ethereum address" },
);

export const Token = z.object({
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int(),
  website: HttpsUrl.optional(),
  description: z.string().optional(),
  explorer: HttpsUrl.optional(),
  address: ChecksummedAddress,
});
