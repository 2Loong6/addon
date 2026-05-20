import * as Api from "@/utils/api";

export interface TestCase {
  name: string;
  status: "executing" | "success" | "error" | null;
  test: () => Promise<boolean>;
}

function httpFetchCase(
  name: string,
  url: string,
  content: string,
  userAgent?: string,
) {
  return {
    name: `${name} || ${url}`,
    status: null,
    test: async () => {
      const resp = await Api.http_fetch(url, {
        headers: {
          "User-Agent": userAgent ?? navigator.userAgent,
        },
      });
      return resp.status === 200 && resp.body.includes(content);
    },
  } as TestCase;
}

function tabHttpFetchCase(
  name: string,
  tabUrl: string,
  url: string,
  content: string,
  userAgent?: string,
) {
  return {
    name: `${name} || ${url}`,
    status: null,
    test: async () => {
      const resp = await Api.tab_http_fetch({
        options: { tabUrl },
        input: url,
        requestInit: {
          headers: {
            "User-Agent": userAgent ?? navigator.userAgent,
          },
        },
      });
      return resp.status === 200 && resp.body.includes(content);
    },
  } as TestCase;
}

async function runTestCase(testCase: TestCase) {
  if (testCase.status === "executing") return;
  testCase.status = "executing";
  await testCase
    .test()
    .then((result) => {
      testCase.status = result ? "success" : "error";
    })
    .catch(() => {
      testCase.status = "error";
    });
}

export const Test = {
  httpFetchCase,
  tabHttpFetchCase,
  runTestCase,
};
