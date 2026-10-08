import { BaseSchemes } from 'rete';
import { Context, Flow, PickParams, SocketData } from 'rete-connection-plugin';

/** One end of an arrow, in canvas node ids. */
export interface SocketEnd {
  nodeId: string;
  key: string;
}

export interface EditFlowHandlers {
  /** Whether a drag may start from this socket. */
  canStart(socket: SocketData): boolean;
  /** Whether an arrow from `source` (an output) may end at `target` (an input). */
  canConnect(source: SocketEnd, target: SocketEnd): boolean;
  connect(source: SocketEnd, target: SocketEnd): void;
  /** The arrow plugged into `target` was picked up and dropped on empty canvas. */
  disconnect(target: SocketEnd): void;
  /** A picked-up arrow was released where it cannot go; draw it back in place. */
  cancel(): void;
}

/**
 * Turns socket gestures into edit requests instead of adding connections itself: the document is
 * the source of truth and the canvas redraws from it. Dragging from an input that already has an
 * arrow picks that arrow up by its end.
 */
export class EditFlow<Schemes extends BaseSchemes> extends Flow<Schemes, never[]> {
  private initial: SocketData | null = null;
  private moved: SocketEnd | null = null;

  constructor(private readonly handlers: EditFlowHandlers) {
    super();
  }

  getPickedSocket(): SocketData | undefined {
    return this.initial ?? undefined;
  }

  async pick({ socket, event }: PickParams, context: Context<Schemes, never[]>): Promise<void> {
    if (!this.initial) {
      if (event === 'down') {
        await this.start(socket, context);
      }
      return;
    }

    const initial = this.initial;
    if (initial.side === socket.side) {
      // Releasing on the socket the drag started from keeps it picked, so click-then-click works.
      const same = initial.nodeId === socket.nodeId && initial.key === socket.key;
      if (!(same && event === 'up')) {
        this.abandon();
      }
      return;
    }
    const output = initial.side === 'output' ? initial : socket;
    const input = initial.side === 'output' ? socket : initial;
    const source = { nodeId: output.nodeId, key: output.key };
    const target = { nodeId: input.nodeId, key: input.key };
    const moved = this.moved;
    if (moved && moved.nodeId === target.nodeId && moved.key === target.key) {
      this.abandon();
      return;
    }
    if (!this.handlers.canConnect(source, target)) {
      this.abandon();
      return;
    }
    this.reset();
    this.handlers.connect(source, target);
  }

  drop(): void {
    const moved = this.moved;
    this.reset();
    if (moved) {
      this.handlers.disconnect(moved);
    }
  }

  private async start(socket: SocketData, context: Context<Schemes, never[]>): Promise<void> {
    if (socket.side === 'input') {
      const existing = context.editor
        .getConnections()
        .find((connection) => {
          const item = connection as unknown as { target: string; targetInput: string };
          return item.target === socket.nodeId && item.targetInput === socket.key;
        }) as unknown as { id: string; source: string; sourceOutput: string } | undefined;
      if (existing && existing.sourceOutput !== 'ref') {
        this.moved = { nodeId: socket.nodeId, key: socket.key };
        const source = Array.from(context.socketsCache.values()).find(
          (item) => item.nodeId === existing.source && item.side === 'output' && item.key === existing.sourceOutput,
        );
        if (!source) {
          this.moved = null;
          return;
        }
        this.initial = source;
        await context.editor.removeConnection(existing.id);
        return;
      }
    }
    if (this.handlers.canStart(socket)) {
      this.initial = socket;
    }
  }

  private abandon(): void {
    const moved = this.moved;
    this.reset();
    if (moved) {
      this.handlers.cancel();
    }
  }

  private reset(): void {
    this.initial = null;
    this.moved = null;
  }
}
