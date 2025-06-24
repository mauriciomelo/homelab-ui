import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { getApps, APP_STATUS, AppStatus } from "@/app/api/applications";
import { cn } from "@/lib/utils";
import { ApplicationForm } from "./application-form";

export default async function AppsPage() {
  const appList = await getApps();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <h1 className="text-2xl font-bold">Apps</h1>

      <Table className="table-fixed">
        <TableCaption>A list of your installed Apps.</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead className="w-2">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>App</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {appList.map((app) => (
            <TableRow key={app.spec.name}>
              <TableCell className="w-2">
                <StatusIcon status={app.status} />
              </TableCell>
              <TableCell className="font-medium">
                <Link target="_blank" href={app.link}>
                  {app.spec.name}
                </Link>
              </TableCell>

              <TableCell className="font-medium">{app.status}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ApplicationForm data={appList[0].spec} />
    </div>
  );
}

function StatusIcon({ status }: { status: AppStatus }) {
  return (
    <div
      title={status}
      className={cn(" rounded-full w-[8px] aspect-square bg-gray-500", {
        "bg-green-500": status === APP_STATUS.RUNNING,
      })}
    ></div>
  );
}
