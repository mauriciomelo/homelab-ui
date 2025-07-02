"use client";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useSelectedLayoutSegments } from "next/navigation";
import React from "react";

export function AppBreadcrumb({ className }: React.ComponentProps<"nav">) {
  const segments = useSelectedLayoutSegments();

  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        <BreadcrumbItem className="hidden md:block">
          <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
        </BreadcrumbItem>

        {segments.map((segment, index) => {
          return (
            <React.Fragment key={index}>
              <BreadcrumbSeparator />
              {index === segments.length - 1 ? (
                <BreadcrumbPage className="capitalize">
                  {segment}
                </BreadcrumbPage>
              ) : (
                <BreadcrumbItem>
                  <BreadcrumbLink
                    href={`/${segments.slice(0, index + 1).join("/")}`}
                    className="capitalize"
                  >
                    {segment}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              )}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
