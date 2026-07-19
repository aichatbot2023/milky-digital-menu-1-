import { Capacitor } from "@capacitor/core";

export type PhotoSource = "prompt" | "camera" | "gallery";

/**
 * Na iOS/Android koristi nativnu kameru (Capacitor), na webu <input> fallback.
 * Podrazumevano ("prompt") korisnik BIRA: slikaj kamerom ILI izaberi
 * postojeću sliku iz galerije — bez capture atributa iOS/Android sami
 * prikazuju meni "Photo Library / Take Photo / Choose File".
 */
export async function capturePhoto(source: PhotoSource = "prompt"): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const { Camera, CameraResultType, CameraSource } = await import("@capacitor/camera");
    const photo = await Camera.getPhoto({
      quality: 85,
      resultType: CameraResultType.DataUrl,
      source:
        source === "camera"
          ? CameraSource.Camera
          : source === "gallery"
            ? CameraSource.Photos
            : CameraSource.Prompt,
      correctOrientation: true,
    });
    return photo.dataUrl ?? null;
  }
  return pickFromFileInput(source);
}

function pickFromFileInput(source: PhotoSource): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    // capture atribut FORSIRA kameru — postavlja se samo na izričit zahtev;
    // bez njega telefon nudi i galeriju i kameru
    if (source === "camera") input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
