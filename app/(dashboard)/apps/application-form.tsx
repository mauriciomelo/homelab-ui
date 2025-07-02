"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2Icon, Plus, Rocket, Trash2 } from "lucide-react";
import type { App } from "@/app/api/applications";
import { appFormSchema } from "./formSchema";
import { updateApp } from "./actions";
import { Separator } from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";

type FormData = z.infer<typeof appFormSchema>;

export function ApplicationForm(props: {
  data: App["spec"];
  className?: string;
}) {
  const form = useForm<FormData>({
    resolver: zodResolver(appFormSchema),
    defaultValues: {
      name: props.data.name,
      image: props.data.image,
      envVariables: props.data.envVariables,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "envVariables",
  });

  const addEnvVariable = () => {
    append({ name: "", value: "" });
  };

  const removeEnvVariable = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  return (
    <Form {...form}>
      <form
        className={cn("space-y-4", props.className)}
        onSubmit={form.handleSubmit(async (data) => {
          const result = await updateApp(data);
          console.log(result);
        })}
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium flex items-center gap-2">
                App Name
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="App Name"
                  className="font-mono text-sm"
                  readOnly
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="image"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-base font-medium flex items-center gap-2">
                Container Image
              </FormLabel>
              <FormControl>
                <Input
                  placeholder="nginx:latest or registry.example.com/my-app:v1.0.0"
                  className="text-base font-mono"
                  {...field}
                />
              </FormControl>
              <FormDescription>
                Specify the Docker image to deploy. Include the full registry
                path and tag.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />

        <div className="text-base font-medium">Environment Variables</div>

        <FormField
          control={form.control}
          name="envVariables"
          render={() => {
            const fieldClassName = "font-mono text-sm m-0";
            return (
              <div className="space-y-2">
                {fields.map((item, index) => (
                  <div
                    key={item.id}
                    className="flex gap-2  border-gray-200 border rounded-md p-2 items-center"
                  >
                    <FormField
                      control={form.control}
                      name={`envVariables.${index}.name`}
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Input
                              placeholder="VARIABLE_NAME"
                              className={cn(
                                fieldClassName,
                                "text-blue-700 w-[200px]"
                              )}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <span className="text-gray-400">=</span>
                    <FormField
                      control={form.control}
                      name={`envVariables.${index}.value`}
                      render={({ field }) => (
                        <FormItem className="flex-1 grow">
                          <FormControl>
                            <Input
                              placeholder="value"
                              className={cn(fieldClassName)}
                              type="text"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      onClick={() => removeEnvVariable(index)}
                      disabled={fields.length === 1}
                      className="shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEnvVariable}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Environment Variable
                </Button>
              </div>
            );
          }}
        />

        <div className="flex gap-3 pt-4">
          {form.formState.isSubmitting ? (
            <Button type="submit" className="flex-1" disabled>
              <Loader2Icon className="animate-spin" />
              Updating...
            </Button>
          ) : (
            <Button type="submit" className="flex-1">
              <Rocket className="h-4 w-4 mr-2" />
              Update
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
