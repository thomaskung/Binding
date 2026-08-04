import { useEffect } from "react";
// Imported from "sonner" (not "binding") but still shimmed onto the same
// window.BindingUI namespace via cfg.extraEntries — required so this
// toast() call shares Toaster's bundled sonner module instance/store rather
// than a second copy from the preview's own esbuild pass.
import { toast } from "sonner";
import { Toaster } from "@binding/ui";

export function Default() {
  useEffect(() => {
    toast.success("Profile published", {
      description: "You're now visible to matching recruiters.",
      duration: Infinity,
    });
  }, []);
  return <Toaster position="top-right" />;
}
