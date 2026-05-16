import { Connection, clusterApiUrl } from "@solana/web3.js";

let _connection: Connection | undefined;

export function getConnection() {
  if (_connection) return _connection;
  const url = process.env.SOLANA_RPC_URL ?? clusterApiUrl("mainnet-beta");
  _connection = new Connection(url, "confirmed");
  return _connection;
}
