/**
 * Copyright (c) 2021 OpenLens Authors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import "./components/app.scss";

import React from "react";
import * as Mobx from "mobx";
import * as MobxReact from "mobx-react";
import * as ReactRouter from "react-router";
import * as ReactRouterDom from "react-router-dom";
import * as LensExtensionsCommonApi from "../extensions/common-api";
import * as LensExtensionsRendererApi from "../extensions/renderer-api";
import { render, unmountComponentAtNode } from "react-dom";
import { CreateSingletons, delay } from "../common/utils";
import { isMac, isDevelopment } from "../common/vars";
import { ClusterStore } from "../common/cluster-store";
import { UserStore } from "../common/user-store";
import { ExtensionDiscovery } from "../extensions/extension-discovery";
import { ExtensionLoader } from "../extensions/extension-loader";
import { App } from "./components/app";
import { LensApp } from "./lens-app";
import { HelmRepoManager } from "../main/helm/helm-repo-manager";
import { DefaultProps } from "./mui-base-theme";
import configurePackages from "../common/configure-packages";
import * as initializers from "./initializers";
import { HotbarStore } from "../common/hotbar-store";
import { WeblinkStore } from "../common/weblink-store";
import { ExtensionsStore } from "../extensions/extensions-store";
import { FilesystemProvisionerStore } from "../main/extension-filesystem";
import { ThemeStore } from "./theme.store";
import { SentryInit } from "../common/sentry";
import { TerminalStore } from "./components/dock/terminal.store";
import { ExtensionInstallationStateStore } from "./components/+extensions/extension-install.store";

configurePackages();

/**
 * If this is a development buid, wait a second to attach
 * Chrome Debugger to renderer process
 * https://stackoverflow.com/questions/52844870/debugging-electron-renderer-process-with-vscode
 */
async function attachChromeDebugger() {
  if (isDevelopment) {
    await delay(1000);
  }
}

type AppComponent = React.ComponentType & {
  init?(): Promise<void>;
};

export async function bootstrap(App: AppComponent) {
  const rootElem = document.getElementById("app");

  await attachChromeDebugger();
  rootElem.classList.toggle("is-mac", isMac);

  initializers.initRegistries();
  initializers.initCommandRegistry();
  initializers.initEntitySettingsRegistry();
  initializers.initKubeObjectMenuRegistry();
  initializers.intiKubeObjectDetailRegistry();
  initializers.initWelcomeMenuRegistry();
  initializers.initWorkloadsOverviewDetailRegistry();
  initializers.initCatalogEntityDetailRegistry();
  initializers.initCatalog();
  initializers.initIpcRendererListeners();

  SentryInit();

  CreateSingletons.begin()
    .declare(ExtensionLoader)
    .declare(ExtensionDiscovery)
    .declare(UserStore)
    .declare(ExtensionsStore)
    .declare(FilesystemProvisionerStore)
    .declare(WeblinkStore)
    .declare(HelmRepoManager)
    .declare(ClusterStore, {
      requires: [UserStore],
    })
    .declare(HotbarStore, {
      requires: [ClusterStore],
    })
    .declare(ThemeStore, {
      requires: [UserStore],
    })
    .declare(TerminalStore, {
      requires: [ThemeStore],
    })
    .buildAll();

  ExtensionLoader.getInstance().init();
  ExtensionDiscovery.getInstance().init();
  ExtensionInstallationStateStore.bindIpcListeners();

  await ClusterStore.getInstance().loadInitialOnRenderer();

  // Register additional store listeners
  ClusterStore.getInstance().registerIpcListener();

  // init app's dependencies if any
  await App.init?.();

  window.addEventListener("message", (ev: MessageEvent) => {
    if (ev.data === "teardown") {
      UserStore.getInstance(false)?.unregisterIpcListener();
      ClusterStore.getInstance(false)?.unregisterIpcListener();
      unmountComponentAtNode(rootElem);
      window.location.href = "about:blank";
    }
  });
  render(<>
    {isMac && <div id="draggable-top" />}
    {DefaultProps(App)}
  </>, rootElem);
}

// run
bootstrap(process.isMainFrame ? LensApp : App);


/**
 * Exports for virtual package "@k8slens/extensions" for renderer-process.
 * All exporting names available in global runtime scope:
 * e.g. Devtools -> Console -> window.LensExtensions (renderer)
 */
const LensExtensions = {
  Common: LensExtensionsCommonApi,
  Renderer: LensExtensionsRendererApi,
};

export {
  React,
  ReactRouter,
  ReactRouterDom,
  Mobx,
  MobxReact,
  LensExtensions,
};
