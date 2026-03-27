import { HttpResponse } from 'msw';

type ORPCStreamEvent = {
  data: unknown;
  delayMs?: number;
};

function isORPCStreamEvent(event: unknown): event is ORPCStreamEvent {
  return typeof event === 'object' && event !== null && 'data' in event;
}

export function orpcJsonResponse(data: unknown) {
  return HttpResponse.json({
    json: data,
  });
}

export function orpcEventStreamResponse(
  events: Array<unknown | ORPCStreamEvent>,
) {
  const normalizedEvents: ORPCStreamEvent[] = events.map((event) => {
    return isORPCStreamEvent(event)
      ? { data: event.data, delayMs: event.delayMs }
      : { data: event };
  });

  if (normalizedEvents.some((event) => event.delayMs)) {
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        for (const event of normalizedEvents) {
          if (event.delayMs) {
            await new Promise((resolve) => setTimeout(resolve, event.delayMs));
          }

          controller.enqueue(
            encoder.encode(
              `event: message\ndata: ${JSON.stringify({ json: event.data })}\n\n`,
            ),
          );
        }

        controller.close();
      },
    });

    return new HttpResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
      },
    });
  }

  const body = normalizedEvents
    .map((event) => {
      return `event: message\ndata: ${JSON.stringify({ json: event.data })}\n\n`;
    })
    .join('');

  return new HttpResponse(body, {
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}
