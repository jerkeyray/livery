# Troubleshooting

- **Nothing renders while streaming:** this is expected before the first valid scene. Supply a chat fallback only for completed failures.
- **A previous visual remains visible:** the retained runtime reports status `retained`; inspect `revision.diagnostics` and decide whether streaming has completed.
- **An image is denied:** use a bounded data image or add its exact HTTPS hostname to `resourcePolicy.allowedImageHosts`.
- **A figure fails only at narrow width:** inspect typed layout diagnostics and the playground debug geometry rather than adding arbitrary macro coordinates.
- **PNG export fails:** verify the packed Node export package includes a compatible Resvg native binary.
