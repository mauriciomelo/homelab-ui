import git from "isomorphic-git";
import fs from "fs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { getApps } from "@/app/api/applications";

export default async function AppsPage() {
  const projectDir = "../homelab-docker";
  let commits = await git.log({
    fs,
    dir: projectDir,
    depth: 5,
    ref: "main",
  });
  console.log(
    "Recent commits:",
    commits.map((commit) => commit.commit.message)
  );

  const appList = await getApps(projectDir);

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h1 className="text-2xl font-bold">Apps</h1>

      <Table>
        <TableCaption>A list of your Apps.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">App</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appList.map((app) => (
            <TableRow key={app.name}>
              <TableCell className="font-medium">
                <Link target="_blank" href={app.link}>
                  {app.name}
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
