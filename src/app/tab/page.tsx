import type { Metadata } from "next";
import { TabApp } from "@/components/TabApp";

export const metadata: Metadata = { title: "Your tab | Toll Bridge" };

export default function TabPage() {
  return <TabApp />;
}
