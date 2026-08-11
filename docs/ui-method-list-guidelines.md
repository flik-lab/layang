# Method list visual guidelines

RPC methods use a quiet two-line list instead of bordered cards or status chips.

## Row hierarchy

- Primary line: method name, 12px medium.
- Secondary line: RPC kind, 11px regular.
- Service name appears once as the group heading.
- Row height is approximately 50px.

## States

- Hover uses the neutral hover surface.
- Selected uses the shared selected surface and a 2px primary left border.
- Selected, hover, and focus never change font weight.
- Running uses one small green dot on the right.
- Unavailable or invalid uses one red circled-X icon on the right.
- Error details appear only on hover or keyboard focus through a tooltip.
- Do not show error text, error chips, or a red row background.

## Actions

- Add scenario is an icon action at the right edge of a supported method.
- The action becomes fully visible on hover, focus, or selection.
- Double-click may open the primary method action, but single-click only selects.
- Every status and icon action must be keyboard focusable and have an accessible label.
