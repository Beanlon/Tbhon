import { Redirect } from "expo-router";

/** Legacy route — landing page replaces this chooser. */
export default function AccountOptions() {
  return <Redirect href="/" />;
}
