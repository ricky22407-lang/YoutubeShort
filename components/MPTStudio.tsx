} else {
          setLog(`🎥 啟動分散式分鏡渲染架構 (完美迴避伺服器限制)...`);
          let bakedChunks: string[] = [];

          for (let i = 0; i < script.scenes.length; i++) {
              const scene = script.scenes[i];
              let rawUrl = '';

              // 步驟 1：向 Kling 拿原始影片 (或從快取拿)
              if (sceneVideoCache[scene.id]) {
                  setLog(`♻️ 第 ${i+1} 幕原始影片已在快取中，跳過 Kling 算圖！`);
                  rawUrl = sceneVideoCache[scene.id];
              } else {
                  setLog(`📥 提交第 ${i+1}/${script.scenes.length} 幕 Kling 算圖請求...`);
                  const isFirstSceneWithProduct = !!referenceImage && scene.id === 1;
                  const submitRes = await fetch('/api/pipeline', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ stage: 'generate_video_submit', visualCue: scene.visual_cue, isFirstSceneWithProduct, useStockFootage: config.useStockFootage, videoEngine: config.videoEngine, klingModelVersion: config.klingModelVersion, referenceImage: referenceImage || script.referenceImage })
                  }).then(r => r.json());

                  if (!submitRes.success) throw new Error(`第 ${scene.id} 幕提交失敗: ${submitRes.error}`);

                  if (submitRes.isStock) {
                      rawUrl = submitRes.videoUrl;
                  } else {
                      setLog(`⏳ 第 ${i+1} 幕任務已送出！等待 4 分鐘後查詢...`);
                      await new Promise(resolve => setTimeout(resolve, 240000));
                      let attempts = 0;
                      while (true) {
                          const statusRes = await fetch('/api/pipeline', {
                              method: 'POST', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ stage: 'generate_video_status', videoEngine: config.videoEngine, taskId: submitRes.taskId, operation: submitRes.operation })
                          }).then(r => r.json());

                          if (statusRes.status === 'completed') {
                              rawUrl = statusRes.videoUrl;
                              setSceneVideoCache(prev => ({ ...prev, [scene.id]: rawUrl })); 
                              break; 
                          } else if (statusRes.status === 'failed' || statusRes.status === 'error') {
                              throw new Error(`第 ${scene.id} 幕失敗: ${statusRes.error}`);
                          }
                          attempts++;
                          setLog(`⏳ 第 ${i+1} 幕持續算圖中... (已輪詢 ${attempts} 次)`);
                          if (attempts > 30) throw new Error(`第 ${scene.id} 幕嚴重超時`);
                          await new Promise(resolve => setTimeout(resolve, 20000)); 
                      }
                  }
              }

              // 步驟 2：原始影片拿到後，立刻呼叫伺服器「只針對這一幕」進行剪輯與壓字 (只需 5 秒)
              setLog(`🎬 第 ${i+1} 幕取得影片，正在雲端壓製專屬配音與字幕...`);
              const chunkRes = await fetch('/api/pipeline', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ stage: 'render_scene_chunk', scene, videoUrl: rawUrl, mptConfig: config })
              }).then(r => r.json());

              if (!chunkRes.success) throw new Error(`第 ${scene.id} 幕壓製失敗: ${chunkRes.error}`);
              bakedChunks.push(chunkRes.chunkUrl);
          }

          // 步驟 3：所有分鏡都壓製完畢，啟動光速無損合併！
          setLog('🚀 啟動極限光速合併 (無損拼接，不需重新編碼)...');
          const stitchRes = await fetch('/api/pipeline', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ stage: 'stitch_final', chunkUrls: bakedChunks, mptConfig: config, previousVideoUrl: videoUrl })
          }).then(r => r.json());

          if (!stitchRes.success) throw new Error(`合併失敗: ${stitchRes.error}`);
          setVideoUrl(stitchRes.videoUrl);
          setLog("✅ 終極渲染完成！");
      }
    } catch (e: any) { setLog("錯誤: " + e.message); } finally { setLoading(false); }
  };
