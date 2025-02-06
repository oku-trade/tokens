import { Address, checksumAddress } from "viem";

const addressRegex = /^0x[a-fA-F0-9]{40}$/;

export function actuallyStrictIsAddress(address: string): address is Address {
  if (!addressRegex.test(address)) return false;
  return checksumAddress(address as Address) === address;
}
