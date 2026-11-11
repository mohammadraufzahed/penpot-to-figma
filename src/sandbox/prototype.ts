import type { PenpotInteraction, PenpotShape } from '../shared/penpot';
import type { WarningCollector } from '../shared/convert/warnings';

export interface PrototypeContext {
  /** Map penpot shape id → created Figma node id. */
  nodeIdByShapeId: Map<string, string>;
  /** Map penpot page id → Figma page node id. */
  pageNodeIdByPageId: Map<string, string>;
  /** Map penpot shape id → Figma node. */
  nodeByShapeId: Map<string, SceneNode>;
  warnings: WarningCollector;
}

function mapEventType(eventType: string | undefined): Trigger | null {
  switch (eventType) {
    case 'click':
      return { type: 'ON_CLICK' };
    case 'mouse-press':
      return { type: 'ON_PRESS' };
    case 'mouse-over':
    case 'mouse-enter':
      return { type: 'MOUSE_ENTER', delay: 0, deprecatedVersion: false };
    case 'mouse-leave':
      return { type: 'MOUSE_LEAVE', delay: 0, deprecatedVersion: false };
    case 'after-delay':
      return { type: 'AFTER_TIMEOUT', timeout: 1 };
    default:
      return null;
  }
}

function mapEasing(easing: string | undefined): Easing {
  switch (easing) {
    case 'linear':
      return { type: 'LINEAR' };
    case 'ease-in':
      return { type: 'EASE_IN' };
    case 'ease-out':
      return { type: 'EASE_OUT' };
    default:
      return { type: 'EASE_IN_AND_OUT' };
  }
}

function mapAnimationType(animation: PenpotInteraction['animation']): Transition | null {
  if (!animation) return null;
  const duration = Math.min(10, Math.max(0.05, (animation.duration ?? 300) / 1000));
  const easing = mapEasing(animation.easing);
  const type = animation.animationType;
  if (type === 'slide') {
    const direction = String(animation.direction ?? 'left').toUpperCase();
    const dir = direction === 'RIGHT' ? 'RIGHT' : direction === 'UP' || direction === 'TOP' ? 'TOP' : direction === 'DOWN' || direction === 'BOTTOM' ? 'BOTTOM' : 'LEFT';
    return { type: 'SLIDE_IN', direction: dir as 'LEFT' | 'RIGHT' | 'TOP' | 'BOTTOM', matchLayers: false, easing, duration };
  }
  if (type === 'push') {
    return { type: 'PUSH', direction: 'LEFT', matchLayers: false, easing, duration };
  }
  // dissolve / default
  return { type: 'DISSOLVE', easing, duration };
}

function defaultTransition(): Transition {
  return { type: 'DISSOLVE', easing: { type: 'EASE_IN_AND_OUT' }, duration: 0.3 };
}

/** Apply Penpot interactions to a Figma node as prototype reactions. */
export async function applyInteractions(node: SceneNode, shape: PenpotShape, ctx: PrototypeContext): Promise<void> {
  const interactions = shape.interactions;
  if (!interactions || interactions.length === 0) return;
  if (!('reactions' in node)) return;

  const reactions: Reaction[] = [];

  for (const interaction of interactions) {
    const trigger = mapEventType(interaction.eventType);
    if (!trigger) {
      ctx.warnings.add(`Unsupported event type "${interaction.eventType}" on "${shape.name ?? shape.id}"`, shape);
      continue;
    }

    const actionType = interaction.actionType;
    let action: Action | null = null;

    switch (actionType) {
      case 'navigate':
      case 'prev-screen': {
        const destId = interaction.destination;
        const figmaDestId = destId ? ctx.nodeIdByShapeId.get(destId) : undefined;
        if (!figmaDestId) {
          ctx.warnings.add(`Navigate target not found for "${shape.name ?? shape.id}"`, shape);
          break;
        }
        action = {
          type: 'NODE',
          destinationId: figmaDestId,
          navigation: actionType === 'prev-screen' ? 'BACK' : 'NAVIGATE',
          transition: mapAnimationType(interaction.animation) ?? defaultTransition(),
          preserveScrollPosition: interaction.preserveScroll ?? false
        } as Action;
        break;
      }
      case 'open-url': {
        const url = interaction.url;
        if (!url) {
          ctx.warnings.add(`Open-url interaction missing url on "${shape.name ?? shape.id}"`, shape);
          break;
        }
        action = { type: 'URL', url } as Action;
        break;
      }
      case 'open-overlay':
      case 'toggle-overlay':
      case 'close-overlay': {
        const destId = interaction.destination;
        const figmaDestId = destId ? ctx.nodeIdByShapeId.get(destId) : undefined;
        if (!figmaDestId) {
          ctx.warnings.add(`Overlay target not found for "${shape.name ?? shape.id}"`, shape);
          break;
        }
        action = {
          type: 'NODE',
          destinationId: figmaDestId,
          navigation: 'OVERLAY',
          transition: mapAnimationType(interaction.animation) ?? defaultTransition(),
          overlayRelativePosition: interaction.overlayPosition
            ? ({ x: interaction.overlayPosition.x ?? 0, y: interaction.overlayPosition.y ?? 0 } as Vector)
            : undefined,
          overlayBackgroundInteraction: interaction.backgroundOverlay ? 'CLOSE' : 'NONE',
          overlayBackgroundColor: { r: 0, g: 0, b: 0, a: 0.5 }
        } as Action;
        void actionType;
        break;
      }
      default:
        ctx.warnings.add(`Unsupported action type "${actionType}" on "${shape.name ?? shape.id}"`, shape);
        continue;
    }

    if (action) {
      reactions.push({ trigger, action } as Reaction);
    }
  }

  if (reactions.length > 0) {
    try {
      await (node as ReactionMixin).setReactionsAsync(reactions);
    } catch (err) {
      ctx.warnings.add(`Failed to set reactions on "${shape.name ?? shape.id}": ${String(err)}`, shape);
    }
  }
}
