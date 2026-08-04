import { common } from "./common";
import { metadata } from "./metadata";
import { landing } from "./landing";
import { home } from "./home";
import { workspace } from "./workspace";
import { focus } from "./focus";

export const zh = { common, metadata, landing, home, workspace, focus };

export type Dictionary = typeof zh;
