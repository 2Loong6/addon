<script lang="ts" setup>
import { ref } from "vue";

import Case from "./components/Case.vue";
import Divider from "./components/Divider.vue";
import type { TestCase } from "./test";
import { Test } from "./test";

const cases = ref<TestCase[]>([
  Test.httpFetchCase(
    "httpFetch 测试",
    "https://www.amazon.co.jp/dp/4098505789",
    "異世界転生して魔女になったの",
  ),
  Test.httpFetchCase(
    "httpFetch 测试2",
    "https://httpbin.org/anything",
    "https://httpbin.org/anything",
  ),
  Test.httpFetchCase(
    "httpFetch UA 测试",
    "https://httpbin.org/anything",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Edg/148.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Edg/148.0.0.0",
  ),
  Test.tabHttpFetchCase(
    "tabFetch 测试",
    "https://www.amazon.co.jp/",
    "https://www.amazon.co.jp/dp/4098505789",
    "異世界転生して魔女になったの",
  ),
  Test.tabHttpFetchCase(
    "tabFetch UA 测试",
    "https://syosetu.org",
    "https://syosetu.org/novel/275835/",
    'id="pagetitle"',
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1 Edg/148.0.0.0"
  ),
]);

async function runAllTestCases() {
  for (const c of cases.value) {
    await Test.runTestCase(c);
  }
}

async function runAllTestCasesParallel() {
  await Promise.all(
    cases.value.map((c: any) => {
      return Test.runTestCase(c);
    }),
  );
}
</script>

<template>
  <div class="m-auto max-w-160 flex flex-col my-12">
    <div class="flex items-center">
      <h1 class="text-3xl font-bold text-gray-900 my-4">测试用例</h1>
      <div class="flex-1" />
      <p class="font-bold text-gray-900 my-4"> 并行测试下部分测试用例可能失败，请手动重试</p>
      <div class="flex-1" />
      <button
        class="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors mr-4"
        @click="runAllTestCases"
      >
        运行所有测试
      </button>
      <button
        class="px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
        @click="runAllTestCasesParallel"
      >
        并行运行所有测试
      </button>
    </div>
    <Divider />
    <template v-for="c in cases" :key="c.name">
      <Case :name="c.name" :status="c.status" @run="Test.runTestCase(c)" />
      <Divider />
    </template>
  </div>
</template>
