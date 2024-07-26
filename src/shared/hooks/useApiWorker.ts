import { Dispatch, SetStateAction, useRef, useState } from "react";
import { isEqual } from "../utils/equalityChecks";
import { useTaskQueue } from "../providers/ApiWorkerProvider";
import { QueryConfig } from "../types/types";
import { useCustomCallback } from "./useCustomCallback";

export const useApiWorker = <T>(
  apiQueryConfig: QueryConfig,
): [T | undefined, () => T extends Promise<unknown> ? T : void] => {
  const { addToQueue } = useTaskQueue();
  const [, setData] = useState<number>(0);

  const lastRequestRequestDate = useRef<Date>(new Date());
  const runOnceRef = useRef<boolean>(false);

  const dataRef = useRef<unknown>(); //Let's ensure referential integrity
  const callBackRef = useRef<(data: unknown) => void>((data: unknown) => {
    dataRef.current = data;
    setData((state: number) => (state += 1));
  });
  const ApiConfigRef = useRef<QueryConfig | undefined>(undefined);

  //Compare when files are added, if the same config is sent in?
  if (!isEqual(ApiConfigRef.current, apiQueryConfig)) ApiConfigRef.current = apiQueryConfig; //Keep a ref so that the method makeRequest below, will have the latest config data

  const makeRequest = useCustomCallback(
    (
      /*
        Resolve is passed in when a user has selected to have a promise returend, instead of a function to make a request.
        Resolve, will return the data from the api call to the calling function.
      */
      resolve?: (data: Dispatch<SetStateAction<undefined>> | unknown) => void,
    ) => {
      if (ApiConfigRef?.current?.queryConfig) {
        //If it's runonce, and the runOnceRef is true, then dont' call the worker, and re-used the data in the hook
        const runOnce = Boolean(ApiConfigRef.current.queryConfig.runOnce);

        if (runOnceRef.current && runOnce) return;
        else {
          //Let's set runOnceRef to true, but continue processing
          runOnceRef.current = runOnce;
        }

        //Compare the current time, with the last time.  If it's >= 2000 ms, then addToQueue, otherwise, it's a re-render and re-use the current data
        const currentDate = new Date();

        /*
      Is it because it's been less than 5 secconds that the worker isn't called again?
    */
        if (
          !dataRef.current ||
          //If makeRequest is called repeatedly, from re-rendering, we can avoid it by only making calls if it's been 2 seconds, since the last call.
          currentDate.getTime() - lastRequestRequestDate.current.getTime() >= 5000
        ) {
          //Update lastRequestRequestDate
          lastRequestRequestDate.current = new Date();
          //If reset is true, then we don't want to pass a callback.
          const callback = ApiConfigRef.current.queryConfig.reset ? undefined : resolve ? resolve : callBackRef.current;

          addToQueue(
            ApiConfigRef.current.queryConfig,
            ApiConfigRef.current.requestConfig,
            callback, // resolve ? resolve : callBackRef.current,
          );

          if (!callback && Boolean(dataRef.current)) {
            //If a callback isn't passed and there is currently data in dataRef.current, then reset the data and trigger a re-render
            //reset the data here.  callback will be undefined
            dataRef.current = undefined;
            //Trigger an update
            setData(0);
          }
        }

        if (
          ApiConfigRef.current.queryConfig &&
          typeof ApiConfigRef.current.queryConfig?.run !== "undefined" &&
          !ApiConfigRef.current.queryConfig?.run
        )
          return;
      }
    },
    [ApiConfigRef.current, apiQueryConfig],
  );

  const request = ApiConfigRef?.current?.returnPromise
    ? () =>
        new Promise((resolve) => {
          makeRequest(resolve); //Pass resolve to replace the use of setData, in order to have data returned from the promise
        })
    : makeRequest;

  //If there is no request object it could be a request for data from the cache.  If runAuto is used, it means the app is not using the lazy function
  if (!ApiConfigRef?.current?.requestConfig || ApiConfigRef?.current?.queryConfig?.runAuto) {
    //Fire off request if requestObject is undefined
    request();
  }

  return [dataRef.current as T, request as () => T extends Promise<unknown> ? T : void];
};
