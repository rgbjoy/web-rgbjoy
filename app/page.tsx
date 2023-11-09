import Home from "@/pages/home.client";
import { getData } from "@/utilities/getData";

export const metadata = {
  title: 'Tom Fletcher',
  description: 'Multidisciplinary digital creator & web engineer',
}

export default async function Page() {
  'use server'
  const query = `
    query getHome {
      page(id:"cG9zdDo1") {
        home {
          header
          subhead
          intro
          button
        }
      }
    }
  `;
  const { data: { page: { home } } } = await getData(query)

  return (
    <Home {...home} />
  );
}